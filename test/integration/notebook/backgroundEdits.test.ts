import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  __resetNotebookAIBridgeForTests,
  registerWorkspace,
  type NotebookWorkspaceController,
} from "../../../src/utils/notebooks/notebookAIBridge"
import { createModelToolsClient } from "../../../src/utils/ai/aiAssistant"
import type { Client } from "../../../src/utils/questdb/client"

const makeWorkspace = (
  overrides: Partial<NotebookWorkspaceController> = {},
): NotebookWorkspaceController => ({
  createNotebook: ({ label }) =>
    Promise.resolve({ bufferId: 1, label: label ?? "Notebook" }),
  duplicateNotebook: ({ bufferId }) =>
    Promise.resolve({ bufferId, label: "copy" }),
  archiveTab: () => Promise.resolve(),
  restoreTab: () => Promise.resolve(),
  activateTab: () => Promise.resolve(),
  renameTab: () => Promise.resolve(),
  deleteTab: () => Promise.resolve(),
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
