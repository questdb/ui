import "../../../test/stubBrowserGlobals"
import { describe, it, expect, beforeEach } from "vitest"

import { __resetNotebookAIBridgeForTests } from "../notebookAIBridge"
import { NotebookToolError } from "../notebookToolError"
import {
  __resetNotebookControllerForTests,
  getController,
  registerController,
  unregisterController,
  waitForController,
  type NotebookController,
} from "./"
import { __resetNotebookBufferQueuesForTests } from "../notebookBufferQueue"
import { __resetNotebookDexieControllerForTests } from "./"
import { db } from "../../../store/db"
import { type NotebookViewState } from "../../../store/notebook"

const emptyState: NotebookViewState = { cells: [] }

const makeController = (
  bufferId: number,
  overrides: Partial<NotebookController> = {},
): NotebookController => ({
  bufferId,
  kind: "live",
  mutate: (transition) =>
    Promise.resolve(
      transition({
        cells: [],
        settings: {},
        maximizedCellId: null,
        focusedCellId: null,
      }).result,
    ),
  mutateWithResultStatus: (transition) =>
    Promise.resolve(
      transition(
        {
          cells: [],
          settings: {},
          maximizedCellId: null,
          focusedCellId: null,
        },
        () => "unrequested",
      ).result,
    ),
  readView: () => Promise.resolve(emptyState),
  runCell: () =>
    Promise.resolve({ success: true, queryCount: 1, results: ["success"] }),
  ...overrides,
})

beforeEach(async () => {
  __resetNotebookControllerForTests()
  __resetNotebookAIBridgeForTests()
  __resetNotebookBufferQueuesForTests()
  __resetNotebookDexieControllerForTests()
  await db.buffers.clear()
})

describe("controller registry", () => {
  it("get returns the registered controller", () => {
    const c = makeController(42)
    registerController(c)
    expect(getController(42)).toBe(c)
  })

  it("unregister removes the controller", () => {
    registerController(makeController(42))
    unregisterController(42)
    expect(getController(42)).toBeUndefined()
  })

  it("re-register replaces the previous controller", async () => {
    const first = makeController(42, {
      readView: () => Promise.resolve({ cells: [], maximizedCellId: "first" }),
    })
    const second = makeController(42, {
      readView: () => Promise.resolve({ cells: [], maximizedCellId: "second" }),
    })
    registerController(first)
    registerController(second)
    await expect(
      getController(42)
        ?.readView()
        .then((v) => v.maximizedCellId),
    ).resolves.toBe("second")
  })
})

describe("waitForController", () => {
  it("resolves immediately when the controller is already registered", async () => {
    const c = makeController(42)
    registerController(c)
    await expect(waitForController(42, 100)).resolves.toBe(c)
  })

  it("resolves a pending wait as soon as the controller registers", async () => {
    const pending = waitForController(42, 500)
    setTimeout(() => registerController(makeController(42)), 10)
    await expect(pending).resolves.toMatchObject({ bufferId: 42 })
  })

  it("supports multiple concurrent waiters for the same bufferId", async () => {
    const a = waitForController(42, 500)
    const b = waitForController(42, 500)
    const controller = makeController(42)
    registerController(controller)
    const [resA, resB] = await Promise.all([a, b])
    expect(resA).toBe(controller)
    expect(resB).toBe(controller)
  })

  it("rejects with a typed activation_failed error after timeoutMs", async () => {
    // Given no controller ever registers
    // When the waiter times out
    const err: unknown = await waitForController(42, 20).catch(
      (e: unknown) => e,
    )
    // Then the model receives a typed, retryable error — not a generic failure
    expect(err).toBeInstanceOf(NotebookToolError)
    expect((err as NotebookToolError).code).toBe("activation_failed")
    expect((err as NotebookToolError).message).toMatch(
      /did not finish mounting within 20ms/,
    )
  })

  it("does not reject a waiter that already resolved before timeout fires", async () => {
    const pending = waitForController(42, 50)
    registerController(makeController(42))
    await pending
    // Wait past the original timeout to ensure no stale rejection fires.
    await new Promise((r) => setTimeout(r, 60))
    const second = waitForController(42, 50)
    await expect(second).resolves.toMatchObject({ bufferId: 42 })
  })
})
