import "../../test/stubBrowserGlobals"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "../../store/db"
import type { ModelToolsClient } from "../ai/aiAssistant"
import { createUserActionDigestState } from "../../providers/AIConversationProvider/userActionDigest"
import {
  __resetNotebookAIBridgeForTests,
  getBufferActionSeq,
  signalUserEdit,
} from "../notebooks/notebookAIBridge"
import { createNotebookFreshness } from "../notebooks/notebookFreshness"
import type { Permissions } from "../tools/permissions"
import { mcpTools } from "../tools/tools"
import { createPermissionsNoticeState, deferUntilSent } from "./deferUntilSent"
import { dispatchMCPTool } from "./dispatchMCPTool"
import { EXPECTED_MCP_VERSION } from "./protocolVersion"

// Every tool succeeds, and one that creates a notebook creates buffer 7.
vi.mock("../tools/dispatch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/dispatch")>()),
  dispatchTool: vi.fn(() =>
    Promise.resolve({ content: JSON.stringify({ bufferId: 7 }) }),
  ),
}))

const WRITE: Permissions = { grantSchemaAccess: true, read: true, write: true }
const NOTICE = /^\[Permissions updated since last call: read=true, write=true\./

beforeEach(async () => {
  __resetNotebookAIBridgeForTests()
  await db.buffers.clear()
  await db.buffers.put({
    id: 1,
    label: "Sample notebook",
    value: "",
    position: 0,
    notebookViewState: { cells: [], settings: { layoutMode: "list" } },
  })
})

afterEach(() => {
  __resetNotebookAIBridgeForTests()
})

// A call on notebook 1, which the agent has read, made after the user granted
// write and added a cell the agent was not told about.
const prepareCall = (name: string) => {
  const freshness = createNotebookFreshness()
  freshness.recordRead(1, getBufferActionSeq(1))
  const recordRead = vi.spyOn(freshness, "recordRead")
  const permissionsNotice = createPermissionsNoticeState()
  permissionsNotice.markChanged()
  const userActions = createUserActionDigestState()
  userActions.apply({ kind: "user_added_cell", bufferId: 1, cellId: "u1" })
  const deferred = deferUntilSent(
    {
      modelToolsClient: {} as ModelToolsClient,
      freshness,
      metaToolContext: {
        getActiveBufferId: () => 1,
        getWorkspace: () => ({
          notebooks: [
            { buffer_id: 1, label: "Sample notebook", archived: false },
          ],
          active: { buffer_id: 1, label: "Sample notebook", kind: "notebook" },
        }),
        getDigest: () => userActions.peek(),
      },
      getPermissions: () => WRITE,
      validateSql: () =>
        Promise.resolve({ query: "", columns: [], timestamp: 0 }),
    },
    { permissionsNotice, userActions },
  )
  const dispatch = async () => {
    const result = await dispatchMCPTool(
      {
        v: EXPECTED_MCP_VERSION,
        type: "tool_call",
        requestId: `r-${name}`,
        name,
        arguments: { buffer_id: 1 },
        deadlineMs: null,
      },
      deferred.ctx,
    )
    return result.content.map((part) => part.text).join("\n")
  }
  const pendingActions = () => userActions.capture()?.digest.added
  return {
    dispatch,
    settle: deferred.settle,
    freshness,
    recordRead,
    permissionsNotice,
    pendingActions,
  }
}

describe.each(mcpTools.map(({ name }) => name))("a %s result", (name) => {
  it("that is dropped tells the agent nothing", async () => {
    // Given
    const call = prepareCall(name)

    // When
    await call.dispatch()
    call.settle(false)

    // Then
    expect(call.recordRead).not.toHaveBeenCalled()
    expect(call.permissionsNotice.capture().due).toBe(true)
    expect(call.pendingActions()).toEqual(new Set(["u1"]))
  })

  it("that is sent counts what it carries as told", async () => {
    // Given
    const call = prepareCall(name)

    // When
    const text = await call.dispatch()
    call.settle(true)

    // Then the notice and the actions it reported since the last check are
    // told
    expect(text).toMatch(NOTICE)
    expect(call.permissionsNotice.capture().due).toBe(false)
    expect(call.pendingActions()).toEqual(
      /<since_last_check>[^]*added: \[u1\]/.test(text)
        ? undefined
        : new Set(["u1"]),
    )
  })
})

it.each([
  ["get_notebook_state", 1, "stale"],
  ["get_workspace_state", 1, "stale"],
  ["create_notebook", 7, "not_fetched"],
  ["duplicate_notebook", 7, "not_fetched"],
] as const)(
  "trusts the notebook a %s result shows only once the result is sent",
  async (name, bufferId, unread) => {
    // Given the user edited notebook 1 since the agent read it
    const dropped = prepareCall(name)
    const sent = prepareCall(name)
    if (unread === "stale") signalUserEdit(1)

    // When one result is dropped, and another is sent
    await dropped.dispatch()
    dropped.settle(false)
    await sent.dispatch()
    sent.settle(true)

    // Then only the sent one vouches for the notebook it shows
    expect(dropped.freshness.assertFresh(bufferId)).toBe(unread)
    expect(sent.freshness.assertFresh(bufferId)).toBe("fresh")
  },
)

it("keeps a permission change made while a result was in flight for the next one", () => {
  // Given a result that captured the notice
  const notice = createPermissionsNoticeState()
  notice.markChanged()
  const inFlight = notice.capture()

  // When the user changes the permissions again before that result is sent
  notice.markChanged()
  inFlight.finish(true)

  // Then the next result still carries a notice
  expect(inFlight.due).toBe(true)
  expect(notice.capture().due).toBe(true)
})

// A call's context, for a turn whose chat answer takes suggested queries
// when onSuggestedQuery is given.
const deferSuggestion = (onSuggestedQuery?: (sql: string) => void) =>
  deferUntilSent(
    {
      modelToolsClient: {} as ModelToolsClient,
      freshness: createNotebookFreshness(),
      metaToolContext: {
        getActiveBufferId: () => null,
        getWorkspace: () => null,
        getDigest: () => null,
      },
      getPermissions: () => WRITE,
      validateSql: () =>
        Promise.resolve({ query: "", columns: [], timestamp: 0 }),
      onSuggestedQuery,
    },
    {
      permissionsNotice: createPermissionsNoticeState(),
      userActions: createUserActionDigestState(),
    },
  )

it.each([
  ["sent", true, [["SELECT 1"]]],
  ["dropped", false, []],
] as const)(
  "shows a suggested query whose result is %s only if the agent got it",
  (_, sent, shown) => {
    // Given a call of a chat answer that takes a suggested query
    const onSuggestedQuery = vi.fn()
    const deferred = deferSuggestion(onSuggestedQuery)

    // When the call suggests a query, and its result is then sent or dropped
    deferred.ctx.onSuggestedQuery?.("SELECT 1")
    const shownBeforeResult = onSuggestedQuery.mock.calls.length
    deferred.settle(sent)

    // Then the answer shows the query only once the agent was told it does
    expect(shownBeforeResult).toBe(0)
    expect(onSuggestedQuery.mock.calls).toEqual(shown)
  },
)

it("offers no suggestion to a call whose turn takes none", () => {
  // Given a call that no chat answer takes, like one from the terminal
  const deferred = deferSuggestion()

  // Then its context has nowhere to show a suggestion
  expect(deferred.ctx.onSuggestedQuery).toBeUndefined()
})
