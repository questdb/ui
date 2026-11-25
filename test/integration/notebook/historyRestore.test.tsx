// @vitest-environment jsdom
import { renderComponent, getHook } from "../../../src/test/component"
import React from "react"
import { act, fireEvent, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { EditorProvider, useEditor } from "../../../src/providers"
import { Tabs } from "../../../src/scenes/Editor/Monaco/tabs"
import { Notebook } from "../../../src/scenes/Editor/Notebook"
import { NotebookWorkspaceBridge } from "../../../src/scenes/Editor/Notebook/NotebookWorkspaceBridge"
import { useBridgeToolRunner } from "../../../src/providers/MCPBridgeProvider/useBridgeToolRunner"
import { resolveGetWorkspaceState } from "../../../src/utils/mcp/metaResolvers"
import type { MetaToolContext } from "../../../src/utils/mcp/metaResolvers"
import { dispatchTool } from "../../../src/utils/tools/dispatch"
import type { ModelToolsClient } from "../../../src/utils/ai/aiAssistant"
import type { Permissions } from "../../../src/utils/tools/permissions"
import {
  __resetNotebookAIBridgeForTests,
  getWorkspace,
} from "../../../src/utils/notebooks/notebookAIBridge"
import {
  __resetNotebookControllerForTests,
  getController,
} from "../../../src/utils/notebooks/notebookController"
import { __resetNotebookBufferQueuesForTests } from "../../../src/utils/notebooks/notebookBufferQueue"
import { db } from "../../../src/store/db"
import type { TimeRange } from "../../../src/store/notebook"

// The editor provider boots Monaco's loader; nothing here renders an editor.
vi.mock("@monaco-editor/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@monaco-editor/react")>()),
  loader: {
    config: () => undefined,
    init: () => new Promise(() => undefined),
  },
}))
// The notebook stays in list layout; the grid engine is never rendered.
vi.mock("react-grid-layout", () => ({
  ResponsiveGridLayout: () => null,
  useContainerWidth: () => ({ width: 0, containerRef: { current: null } }),
  verticalCompactor: {},
}))
vi.mock("react-grid-layout/core", () => ({ absoluteStrategy: {} }))
// The toolbar's AI entry points need the conversation providers; the time
// range under test is shown by the variables bar.
vi.mock("../../../src/scenes/Editor/Notebook/NotebookToolbar", () => ({
  NotebookToolbar: () => null,
}))
vi.mock("react-redux", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-redux")>()),
  useSelector: () => [],
}))

const NOTEBOOK_ID = 1
const SQL_TAB_ID = 2
const OLD_RANGE: TimeRange = {
  from: "2026-10-14T19:00:00.000Z",
  to: "2026-10-14T20:00:00.000Z",
}
const NEW_RANGE: TimeRange = { from: "now/d", to: "now" }

const ALL_GRANTED: Permissions = {
  grantSchemaAccess: true,
  read: true,
  write: true,
}
const dqlValidator = () =>
  Promise.resolve({ query: "", columns: [], timestamp: 0 })

// The agent's notebook workspace calls go through the mounted workspace
// bridge, exactly as createModelToolsClient wires them.
const client = {
  validateQuery: () => Promise.resolve({ valid: true }),
  validateSqlRaw: dqlValidator,
  runQueryRaw: () =>
    Promise.resolve({ type: "dql", columns: [], dataset: [], count: 0 }),
  createNotebook: () => Promise.reject(new Error("unused")),
  duplicateNotebook: () => Promise.reject(new Error("unused")),
  activateNotebook: () => Promise.reject(new Error("unused")),
  deleteNotebook: (bufferId: number) =>
    getWorkspace()!.deleteNotebook(bufferId),
} as ModelToolsClient

const agent = (tool: string, input: unknown) =>
  dispatchTool(tool, input, client, () => undefined, ALL_GRANTED, dqlValidator)

// The console's editor state and the MCP bridge's view of the workspace, as
// get_workspace_state reads it.
const probe: {
  editor: ReturnType<typeof useEditor> | null
  meta: MetaToolContext | null
} = { editor: null, meta: null }
const Probe = () => {
  probe.editor = useEditor()
  probe.meta = useBridgeToolRunner(
    () => null,
    () => null,
  ).metaToolContext
  return null
}

// Mirrors the editor pane: the notebook view remounts when the active buffer
// or its archived flag changes.
const ActiveNotebook = () => {
  const { activeBuffer } = useEditor()
  if (!activeBuffer.notebookViewState) return null
  return (
    <Notebook
      key={`${activeBuffer.id}:${activeBuffer.archived ? "archived" : "live"}`}
    />
  )
}

const Console = () => (
  <EditorProvider>
    <NotebookWorkspaceBridge />
    <Probe />
    <Tabs />
    <ActiveNotebook />
  </EditorProvider>
)

const storedTimeRange = async () =>
  (await db.buffers.get(NOTEBOOK_ID))?.notebookViewState?.settings?.timeRange

const workspaceState = async () => {
  const [content] = await resolveGetWorkspaceState(undefined, probe.meta!)
  return content.type === "text" ? content.text : ""
}

const restoreFromTabHistory = async () => {
  await act(async () => {
    fireEvent.keyDown(getHook("editor-tabs-history-button"), {
      key: "Enter",
      code: "Enter",
    })
    await Promise.resolve()
  })
  await act(async () => {
    fireEvent.click(getHook("editor-tabs-history-item"))
    await Promise.resolve()
  })
}

beforeEach(async () => {
  __resetNotebookControllerForTests()
  __resetNotebookAIBridgeForTests()
  __resetNotebookBufferQueuesForTests()
  probe.editor = null
  probe.meta = null
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  // jsdom has no canvas; the tab strip's glass effect skips without one.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
  await db.buffers.clear()
  await db.notebook_results.clear()
  await db.notebook_globals.clear()
  await db.buffers.bulkPut([
    {
      id: NOTEBOOK_ID,
      label: "Sales",
      value: "",
      position: 0,
      notebookViewState: {
        cells: [
          { id: "intro", position: 0, type: "markdown", value: "# Sales" },
        ],
        settings: { timeRange: OLD_RANGE },
      },
    },
    { id: SQL_TAB_ID, label: "SQL", value: "SELECT 1", position: 1 },
  ])
  await db.editor_settings
    .where("key")
    .equals("activeBufferId")
    .modify({ value: NOTEBOOK_ID })
})

// The real flow: the notebook is open, the agent archives it with
// delete_notebook, and the user restores it from the tab history menu.
const archiveByAgentThenRestoreFromHistory = async () => {
  renderComponent(<Console />)
  await waitFor(() => expect(getController(NOTEBOOK_ID)?.kind).toBe("live"))
  const deleted = await agent("delete_notebook", { buffer_id: NOTEBOOK_ID })
  expect(deleted.is_error).toBeUndefined()
  await waitFor(() => expect(getController(NOTEBOOK_ID)).toBeUndefined())
  await waitFor(() => expect(probe.editor?.activeBuffer.id).toBe(SQL_TAB_ID))
  await restoreFromTabHistory()
  await waitFor(async () =>
    expect((await db.buffers.get(NOTEBOOK_ID))?.archived).toBe(false),
  )
  await waitFor(() => expect(probe.editor?.activeBuffer.id).toBe(NOTEBOOK_ID))
}

const applyNewTimeRange = async () => {
  const applied = await agent("apply_notebook_state", {
    buffer_id: NOTEBOOK_ID,
    time_range: NEW_RANGE,
    cells: [{ id: "intro", preserve_value: true }],
  })
  expect(applied.is_error).toBeUndefined()
}

describe("restoring a notebook the agent archived", () => {
  it("activates the restored notebook as not archived", async () => {
    // Given the agent archived the open notebook
    // When the user restores it from the tab history
    await archiveByAgentThenRestoreFromHistory()

    // Then the console's active buffer is the stored, unarchived notebook
    expect(probe.editor?.activeBuffer.archived).toBeFalsy()

    // And get_workspace_state reports it as not archived
    const workspace = await workspaceState()
    expect(workspace).toContain(`active: { buffer_id: ${NOTEBOOK_ID}`)
    expect(workspace).not.toContain("archived: true")
  })

  it("routes later agent changes to the mounted notebook", async () => {
    // Given the agent archived the open notebook and the user restored it
    await archiveByAgentThenRestoreFromHistory()

    // Then the restored notebook mounts live again
    await waitFor(() => expect(getController(NOTEBOOK_ID)?.kind).toBe("live"))

    // When the agent changes the time range
    await applyNewTimeRange()

    // Then the mounted notebook shows the new range and stores it
    const view = await getController(NOTEBOOK_ID)!.readView()
    expect(view.settings?.timeRange).toEqual(NEW_RANGE)
    await waitFor(async () =>
      expect(await storedTimeRange()).toEqual(NEW_RANGE),
    )
  })

  it("never lets the restored notebook overwrite the agent's change", async () => {
    // Given the agent archived the open notebook and the user restored it
    await archiveByAgentThenRestoreFromHistory()
    // And the agent then changed the time range
    await applyNewTimeRange()
    await waitFor(async () =>
      expect(await storedTimeRange()).toEqual(NEW_RANGE),
    )

    // When the user switches to another tab, unmounting the notebook view
    const sqlTab = probe.editor!.buffers.find((b) => b.id === SQL_TAB_ID)!
    await act(() => probe.editor!.setActiveBuffer(sqlTab))
    await new Promise((resolve) => setTimeout(resolve, 400))

    // Then the stored notebook still carries the agent's range
    expect(await storedTimeRange()).toEqual(NEW_RANGE)
  })
})
