import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Permissions } from "./permissions"
import { __resetNotebookAIBridgeForTests } from "../notebooks/notebookAIBridge"
import { dispatchTool } from "./dispatch"
import { AIOperationStatus } from "../../providers/AIStatusProvider"

const noop = () => undefined

// Every agent surface supplies permissions and a validator; tests that do not
// exercise gating use the widest grant and a validator that classifies as DQL.
const ALL_GRANTED: Permissions = {
  grantSchemaAccess: true,
  read: true,
  write: true,
}
const dqlValidator = () =>
  Promise.resolve({ query: "", columns: [], timestamp: 0 })

beforeEach(() => {
  __resetNotebookAIBridgeForTests()
})

describe("dispatch — create/duplicate/activate", () => {
  const makeClient = (
    overrides: Partial<Parameters<typeof dispatchTool>[2]> = {},
  ) =>
    ({
      createNotebook: vi.fn(() => Promise.resolve({ bufferId: 9, label: "n" })),
      duplicateNotebook: vi.fn(() =>
        Promise.resolve({ bufferId: 9, label: "copy" }),
      ),
      activateNotebook: vi.fn(() => Promise.resolve(true)),
      ...overrides,
    }) as unknown as Parameters<typeof dispatchTool>[2]

  it("create_notebook tells the agent it was built in the background", async () => {
    // Given a client that creates notebooks
    const client = makeClient()

    // When the agent creates a notebook
    const res = await dispatchTool(
      "create_notebook",
      { label: "n" },
      client,
      noop,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the response carries a hint (the exact wording is pinned in toolDispatch.test.ts)
    const parsed = JSON.parse(res.content) as { hint?: string }
    expect(typeof parsed.hint).toBe("string")
  })

  it("duplicate_notebook tells the agent it was built in the background", async () => {
    // Given a client that duplicates notebooks
    const client = makeClient()

    // When the agent duplicates a notebook
    const res = await dispatchTool(
      "duplicate_notebook",
      { buffer_id: 1 },
      client,
      noop,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the response carries a hint (the exact wording is pinned in toolDispatch.test.ts)
    const parsed = JSON.parse(res.content) as { hint?: string }
    expect(typeof parsed.hint).toBe("string")
  })

  it("create_notebook forwards the dispatch signal", async () => {
    // Given a cancellable create operation
    const createNotebook = vi.fn(() =>
      Promise.resolve({ bufferId: 9, label: "n" }),
    )
    const client = makeClient({ createNotebook })
    const signal = new AbortController().signal

    // When dispatch creates the notebook
    await dispatchTool(
      "create_notebook",
      { label: "n" },
      client,
      noop,
      ALL_GRANTED,
      dqlValidator,
      signal,
    )

    // Then the per-call signal reaches the model tools client
    expect(createNotebook).toHaveBeenCalledWith("n", signal)
  })

  it("duplicate_notebook forwards the dispatch signal", async () => {
    // Given a cancellable duplicate operation
    const duplicateNotebook = vi.fn(() =>
      Promise.resolve({ bufferId: 9, label: "copy" }),
    )
    const client = makeClient({ duplicateNotebook })
    const signal = new AbortController().signal

    // When dispatch duplicates the notebook
    await dispatchTool(
      "duplicate_notebook",
      { buffer_id: 1 },
      client,
      noop,
      ALL_GRANTED,
      dqlValidator,
      signal,
    )

    // Then the per-call signal reaches the model tools client
    expect(duplicateNotebook).toHaveBeenCalledWith(1, signal)
  })

  it("activate_notebook switches to the given buffer and focuses the cell", async () => {
    // Given a client
    const activateNotebook = vi.fn(() => Promise.resolve(true))
    const client = makeClient({ activateNotebook })
    // When activate_notebook dispatches with a cell to focus
    const res = await dispatchTool(
      "activate_notebook",
      { buffer_id: 9, cell_to_focus: "c2" },
      client,
      noop,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then it activated that buffer, passing the cell to focus through
    expect(activateNotebook).toHaveBeenCalledWith(9, "c2")
    expect(res.is_error).toBeUndefined()
  })

  it("activate_notebook reports activation_failed when the tab can't be opened", async () => {
    // Given activation fails
    const client = makeClient({
      activateNotebook: vi.fn(() => Promise.resolve(false)),
    })
    // When activate_notebook dispatches
    const res = await dispatchTool(
      "activate_notebook",
      { buffer_id: 9, cell_to_focus: null },
      client,
      noop,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then it is an error naming the failure
    expect(res.is_error).toBe(true)
    expect(res.content).toMatch(/activation_failed/)
  })
})

describe("dispatch — failed steps", () => {
  const readOnly: Permissions = {
    grantSchemaAccess: true,
    read: true,
    write: false,
  }

  it("marks the step a failed tool showed as failed, with the reason", async () => {
    // Given a table the client cannot describe
    const setStatus = vi.fn()
    const client = {
      getTableDetails: vi.fn(() => Promise.resolve(null)),
    } as unknown as Parameters<typeof dispatchTool>[2]

    // When
    const res = await dispatchTool(
      "get_table_details",
      { table_name: "trades" },
      client,
      setStatus,
      readOnly,
      dqlValidator,
    )

    // Then
    expect(res.is_error).toBe(true)
    expect(setStatus.mock.calls).toEqual([
      [
        AIOperationStatus.InvestigatingTable,
        { name: "trades", tableOpType: "details" },
      ],
      [
        AIOperationStatus.InvestigatingTable,
        {
          name: "trades",
          tableOpType: "details",
          failed: "Table details not found",
        },
      ],
    ])
  })

  it("shows a refused call as a failed step of its own", async () => {
    // Given a console that grants no access
    const setStatus = vi.fn()
    const nothingGranted: Permissions = {
      grantSchemaAccess: false,
      read: false,
      write: false,
    }

    // When
    const res = await dispatchTool(
      "get_tables",
      {},
      {} as Parameters<typeof dispatchTool>[2],
      setStatus,
      nothingGranted,
      dqlValidator,
    )

    // Then
    expect(res.is_error).toBe(true)
    expect(setStatus.mock.calls).toHaveLength(2)
    expect(setStatus.mock.calls[0]).toEqual([
      AIOperationStatus.RetrievingTables,
    ])
    const [failedStatus, failedArgs] = setStatus.mock.calls[1] as [
      AIOperationStatus,
      { failed?: string },
    ]
    expect(failedStatus).toBe(AIOperationStatus.RetrievingTables)
    // The step shows the refusal; asking the user is the model's part.
    expect(failedArgs.failed).toBe(
      "PERMISSION_DENIED: tool 'get_tables' requires the 'grantSchemaAccess' permission.",
    )
    expect(res.content).toMatch(/^PERMISSION_DENIED: .+ Ask the user to grant/)
  })

  it.each(Object.getOwnPropertyNames(Object.prototype))(
    "tells the model a tool named %s does not exist, and shows no step for it",
    async (name) => {
      // Given
      const setStatus = vi.fn()

      // When
      const res = await dispatchTool(
        name,
        {},
        {} as Parameters<typeof dispatchTool>[2],
        setStatus,
        ALL_GRANTED,
        dqlValidator,
      )

      // Then
      expect(res).toEqual({ content: `Unknown tool: ${name}`, is_error: true })
      expect(setStatus).not.toHaveBeenCalled()
    },
  )
})

describe("dispatch — validate_query", () => {
  it("shows the query it validates, and why it is invalid", async () => {
    // Given a query the server rejects
    const setStatus = vi.fn()
    const client = {
      validateQuery: vi.fn(() =>
        Promise.resolve({
          valid: false,
          error: "unknown column: prices",
          position: 7,
        }),
      ),
    } as unknown as Parameters<typeof dispatchTool>[2]

    // When
    await dispatchTool(
      "validate_query",
      { query: "select prices from trades" },
      client,
      setStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then
    const [shown, failed] = setStatus.mock.calls as Array<
      [AIOperationStatus, { content?: string; failed?: string }]
    >
    expect(shown[0]).toBe(AIOperationStatus.ValidatingQuery)
    expect(shown[1].content).toMatch(/prices/i)
    expect(failed).toEqual([
      AIOperationStatus.ValidatingQuery,
      { content: shown[1].content, failed: "unknown column: prices" },
    ])
  })
})

describe("dispatch — step timing", () => {
  it("ends the step a tool showed once the tool is done", async () => {
    // Given
    const setStatus = vi.fn()
    const client = {
      validateQuery: vi.fn(() =>
        Promise.resolve({ query: "select 1", columns: [], timestamp: 0 }),
      ),
    } as unknown as Parameters<typeof dispatchTool>[2]

    // When
    await dispatchTool(
      "validate_query",
      { query: "select 1" },
      client,
      setStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then
    const calls = setStatus.mock.calls as Array<
      [AIOperationStatus, Record<string, unknown>]
    >
    const [status, args] = calls[0]
    expect(calls.at(-1)).toEqual([status, { ...args, ended: true }])
  })
})
