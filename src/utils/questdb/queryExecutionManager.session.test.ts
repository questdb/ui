import { describe, expect, it, vi } from "vitest"
import { QueryExecutionManager } from "./queryExecutionManager"

describe("query execution reset", () => {
  it("aborts all scopes and discards pending confirmations", async () => {
    const manager = new QueryExecutionManager()
    const abort = vi.fn()
    const execute = vi.fn()
    const dismiss = vi.fn()
    manager.markActive(1, "active@1-1", abort)
    manager.markActive(2, "other@1-1", abort, "notebook")
    manager.requestExecution({
      bufferId: 1,
      queryKey: "pending@1-1",
      abort,
      execute,
      onDismiss: dismiss,
    })
    manager.reset()
    await manager.confirmPending()
    expect(abort).toHaveBeenCalledTimes(2)
    expect(dismiss).toHaveBeenCalledOnce()
    expect(execute).not.toHaveBeenCalled()
    expect(manager.getSnapshot()).toEqual({
      active: null,
      pending: null,
      dialogOpen: false,
    })
    expect(manager.isAnyRunning("notebook")).toBe(false)
  })

  it("invalidates an already-confirmed request waiting for the previous query to settle", async () => {
    const manager = new QueryExecutionManager()
    const execute = vi.fn()
    const dismiss = vi.fn()
    manager.markActive(1, "active@1-1", vi.fn())
    manager.requestExecution({
      bufferId: 1,
      queryKey: "pending@1-1",
      abort: vi.fn(),
      execute,
      onDismiss: dismiss,
    })
    const confirming = manager.confirmPending()
    manager.reset()
    await confirming
    expect(execute).not.toHaveBeenCalled()
    expect(dismiss).toHaveBeenCalledOnce()
    expect(manager.isAnyRunning()).toBe(false)
  })
})
