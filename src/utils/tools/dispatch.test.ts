import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Permissions } from "./permissions"
import { __resetNotebookAIBridgeForTests } from "../notebooks/notebookAIBridge"
import { dispatchTool } from "./dispatch"

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
