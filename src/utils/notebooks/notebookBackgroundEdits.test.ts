import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  __resetNotebookAIBridgeForTests,
  registerWorkspace,
  type NotebookWorkspaceController,
} from "./notebookAIBridge"
import { createModelToolsClient } from "../ai/aiAssistant"
import { dispatchTool } from "../tools/dispatch"
import type { Client } from "../questdb/client"

const noop = () => undefined

const makeWorkspace = (
  overrides: Partial<NotebookWorkspaceController> = {},
): NotebookWorkspaceController => ({
  createNotebook: ({ label }) =>
    Promise.resolve({ bufferId: 1, label: label ?? "Notebook" }),
  duplicateNotebook: ({ bufferId }) =>
    Promise.resolve({ bufferId, label: "copy" }),
  deleteNotebook: () => Promise.resolve(),
  activateNotebook: () => Promise.resolve(true),
  listNotebookBuffers: () => [],
  ...overrides,
})

beforeEach(() => {
  __resetNotebookAIBridgeForTests()
})

describe("create/duplicate always work in the background", () => {
  const clientFor = (
    workspace: NotebookWorkspaceController,
    abortSignal?: AbortSignal,
  ) => {
    registerWorkspace(workspace)
    return createModelToolsClient({} as Client, undefined, { abortSignal })
  }

  it("create_notebook never asks the workspace to activate", async () => {
    // Given a workspace recording the options it receives
    const createNotebook = vi.fn(
      ({
        label,
      }: Parameters<NotebookWorkspaceController["createNotebook"]>[0]) =>
        Promise.resolve({ bufferId: 1, label: label ?? "n" }),
    )
    const client = clientFor(makeWorkspace({ createNotebook }))

    // When the agent creates a notebook
    await client.createNotebook("Dash")

    // Then the request carries no activation, so it is created in the background
    expect(createNotebook.mock.calls[0][0]).not.toHaveProperty("activate")
  })

  it("duplicate_notebook never asks the workspace to activate", async () => {
    // Given a workspace recording the options it receives
    const duplicateNotebook = vi.fn(
      ({
        bufferId,
      }: Parameters<NotebookWorkspaceController["duplicateNotebook"]>[0]) =>
        Promise.resolve({ bufferId, label: "copy" }),
    )
    const client = clientFor(makeWorkspace({ duplicateNotebook }))

    // When the agent duplicates a notebook
    await client.duplicateNotebook(1)

    // Then the request carries no activation, so the copy is made in the background
    expect(duplicateNotebook.mock.calls[0][0]).not.toHaveProperty("activate")
  })

  it("forwards a per-call signal to the workspace", async () => {
    // Given a workspace recording create and duplicate options
    const createNotebook = vi.fn(makeWorkspace().createNotebook)
    const duplicateNotebook = vi.fn(makeWorkspace().duplicateNotebook)
    const client = clientFor(
      makeWorkspace({ createNotebook, duplicateNotebook }),
    )
    const signal = new AbortController().signal

    // When both operations receive a dispatch-level signal
    await client.createNotebook("Dash", signal)
    await client.duplicateNotebook(1, signal)

    // Then the same signal reaches both workspace operations
    expect(createNotebook.mock.calls[0][0].signal).toBe(signal)
    expect(duplicateNotebook.mock.calls[0][0].signal).toBe(signal)
  })

  it("falls back to the conversation signal", async () => {
    // Given a chat-scoped signal and no dispatch-level override
    const createNotebook = vi.fn(makeWorkspace().createNotebook)
    const fallbackSignal = new AbortController().signal
    const client = clientFor(makeWorkspace({ createNotebook }), fallbackSignal)

    // When the chat creates a notebook
    await client.createNotebook("Dash")

    // Then the conversation signal reaches the workspace
    expect(createNotebook.mock.calls[0][0].signal).toBe(fallbackSignal)
  })
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
    const client = makeClient()
    const res = await dispatchTool(
      "create_notebook",
      { label: "n" },
      client,
      noop,
    )
    // The exact wording is pinned once in shared.notebookTools.test.ts.
    const parsed = JSON.parse(res.content) as { hint?: string }
    expect(typeof parsed.hint).toBe("string")
  })

  it("duplicate_notebook tells the agent it was built in the background", async () => {
    const client = makeClient()
    const res = await dispatchTool(
      "duplicate_notebook",
      { buffer_id: 1 },
      client,
      noop,
    )
    // The exact wording is pinned once in shared.notebookTools.test.ts.
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
      undefined,
      undefined,
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
      undefined,
      undefined,
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
    )
    // Then it is an error naming the failure
    expect(res.is_error).toBe(true)
    expect(res.content).toMatch(/activation_failed/)
  })
})
