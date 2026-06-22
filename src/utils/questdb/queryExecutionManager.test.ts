import { describe, expect, it, vi } from "vitest"
import type { QueryKey } from "../../store/Query/types"
import { QueryExecutionManager } from "./queryExecutionManager"

const createManager = () => new QueryExecutionManager()

const request = (
  manager: QueryExecutionManager,
  queryKey: QueryKey,
  execute: () => void = vi.fn(),
  options: {
    abort?: () => void
    onDismiss?: () => void
    scopeKey?: string
  } = {},
) =>
  manager.requestExecution({
    abort: vi.fn(),
    bufferId: 1,
    execute,
    queryKey,
    ...options,
  })

describe("QueryExecutionManager", () => {
  it("notifies pending execution when the confirmation dialog is dismissed", () => {
    const manager = createManager()
    const activeKey = "active@0-6" as QueryKey
    const pendingKey = "pending@0-7" as QueryKey
    const onDismiss = vi.fn()
    const pendingExecute = vi.fn()

    request(manager, activeKey)
    request(manager, pendingKey, pendingExecute, { onDismiss })

    expect(manager.getSnapshot().dialogOpen).toBe(true)

    manager.dismissPending()

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(pendingExecute).not.toHaveBeenCalled()
    expect(manager.getSnapshot().dialogOpen).toBe(false)
  })

  it("updates the abort handler when markActive is called for the current key", async () => {
    const manager = createManager()
    const activeKey = "active@0-6" as QueryKey
    const pendingKey = "pending@0-7" as QueryKey
    const events: string[] = []

    request(manager, activeKey, () => events.push("active"))
    manager.markActive(1, activeKey, () => {
      events.push("abort")
      manager.releaseExecution(activeKey)
    })
    request(manager, pendingKey, () => events.push("pending"))

    await manager.confirmPending()

    expect(events).toEqual(["active", "abort", "pending"])
  })

  it("waits for the active execution to release before running the confirmed pending execution", async () => {
    const manager = createManager()
    const activeKey = "active@0-6" as QueryKey
    const pendingKey = "pending@0-7" as QueryKey
    const activeAbort = vi.fn()
    const events: string[] = []

    request(manager, activeKey, () => events.push("active"), {
      abort: () => {
        events.push("abort")
        activeAbort()
      },
    })
    request(manager, pendingKey, () => events.push("pending"))

    const confirm = manager.confirmPending()
    await Promise.resolve()

    expect(activeAbort).toHaveBeenCalledTimes(1)
    expect(events).toEqual(["active", "abort"])
    expect(manager.getActive()?.queryKey).toBe(activeKey)

    manager.releaseExecution(activeKey)
    await confirm

    expect(events).toEqual(["active", "abort", "pending"])
    expect(manager.getActive()?.queryKey).toBe(pendingKey)
  })

  it("aborts and clears the active execution immediately for a scope", () => {
    const manager = createManager()
    const activeKey = "active@0-6" as QueryKey
    const scopeKey = "notebook:1:cell-a"
    const abort = vi.fn()

    request(manager, activeKey, vi.fn(), { abort, scopeKey })

    manager.abortActiveByScope(scopeKey)

    expect(abort).toHaveBeenCalledTimes(1)
    expect(manager.getActive(scopeKey)).toBeNull()
    expect(manager.isAnyRunning(scopeKey)).toBe(false)
  })

  it("aborts only the requested scope", () => {
    const manager = createManager()
    const cellAKey = "cell-a@0-6" as QueryKey
    const cellBKey = "cell-b@0-6" as QueryKey
    const cellAScope = "notebook:1:cell-a"
    const cellBScope = "notebook:1:cell-b"
    const abortA = vi.fn()
    const abortB = vi.fn()

    request(manager, cellAKey, vi.fn(), {
      abort: abortA,
      scopeKey: cellAScope,
    })
    request(manager, cellBKey, vi.fn(), {
      abort: abortB,
      scopeKey: cellBScope,
    })

    manager.abortActiveByScope(cellAScope)

    expect(abortA).toHaveBeenCalledTimes(1)
    expect(abortB).not.toHaveBeenCalled()
    expect(manager.getActive(cellAScope)).toBeNull()
    expect(manager.getActive(cellBScope)?.queryKey).toBe(cellBKey)
  })

  it("cancelActive aborts and clears the default scope", () => {
    const manager = createManager()
    const activeKey = "active@0-6" as QueryKey
    const abort = vi.fn()

    request(manager, activeKey, vi.fn(), { abort })

    manager.cancelActive()

    expect(abort).toHaveBeenCalledTimes(1)
    expect(manager.getActive()).toBeNull()
    expect(manager.isAnyRunning()).toBe(false)
  })

  it("allows executions in different scopes to run at the same time", () => {
    const manager = createManager()
    const cellAKey = "cell-a@0-6" as QueryKey
    const cellBKey = "cell-b@0-6" as QueryKey
    const events: string[] = []

    request(manager, cellAKey, () => events.push("cell-a"), {
      scopeKey: "notebook:1:cell-a",
    })
    request(manager, cellBKey, () => events.push("cell-b"), {
      scopeKey: "notebook:1:cell-b",
    })

    expect(events).toEqual(["cell-a", "cell-b"])
    expect(manager.getSnapshot().dialogOpen).toBe(false)
  })

  it("releases only the requested scope", () => {
    const manager = createManager()
    const cellAKey = "cell-a@0-6" as QueryKey
    const cellBKey = "cell-b@0-6" as QueryKey
    const cellAScope = "notebook:1:cell-a"
    const cellBScope = "notebook:1:cell-b"

    request(manager, cellAKey, vi.fn(), { scopeKey: cellAScope })
    request(manager, cellBKey, vi.fn(), { scopeKey: cellBScope })

    manager.releaseExecution(cellAKey, cellAScope)

    expect(manager.getActive(cellAScope)).toBeNull()
    expect(manager.getActive(cellBScope)?.queryKey).toBe(cellBKey)
  })

  it("opens the confirmation dialog for executions in the same scope", () => {
    const manager = createManager()
    const firstKey = "first@0-5" as QueryKey
    const secondKey = "second@0-6" as QueryKey
    const secondExecute = vi.fn()

    request(manager, firstKey, vi.fn(), {
      scopeKey: "notebook:1:cell-a",
    })
    request(manager, secondKey, secondExecute, {
      scopeKey: "notebook:1:cell-a",
    })

    expect(secondExecute).not.toHaveBeenCalled()
    expect(manager.getSnapshot().dialogOpen).toBe(true)
    expect(manager.getPending("notebook:1:cell-a")?.queryKey).toBe(secondKey)
  })

  it("replaces the existing pending execution in the same scope", () => {
    const manager = createManager()
    const firstKey = "first@0-5" as QueryKey
    const secondKey = "second@0-6" as QueryKey
    const thirdKey = "third@0-5" as QueryKey
    const secondDismiss = vi.fn()
    const secondExecute = vi.fn()
    const thirdExecute = vi.fn()
    const scopeKey = "notebook:1:cell-a"

    request(manager, firstKey, vi.fn(), { scopeKey })
    request(manager, secondKey, secondExecute, {
      scopeKey,
      onDismiss: secondDismiss,
    })
    request(manager, thirdKey, thirdExecute, { scopeKey })

    expect(secondDismiss).toHaveBeenCalledTimes(1)
    expect(secondExecute).not.toHaveBeenCalled()
    expect(thirdExecute).not.toHaveBeenCalled()
    expect(manager.getPending(scopeKey)?.queryKey).toBe(thirdKey)
  })

  it("does not release a newer active execution with a stale key from the same scope", () => {
    const manager = createManager()
    const firstKey = "first@0-5" as QueryKey
    const secondKey = "second@0-6" as QueryKey
    const scopeKey = "notebook:1:cell-a"

    manager.markActive(1, firstKey, vi.fn(), scopeKey)
    manager.markActive(1, secondKey, vi.fn(), scopeKey)
    manager.releaseExecution(firstKey, scopeKey)

    expect(manager.getActive(scopeKey)?.queryKey).toBe(secondKey)
  })

  it("does not run confirmed pending execution when a wrong active key is released", async () => {
    const manager = createManager()
    const activeKey = "active@0-6" as QueryKey
    const wrongKey = "wrong@0-5" as QueryKey
    const pendingKey = "pending@0-7" as QueryKey
    const pendingExecute = vi.fn()
    const scopeKey = "notebook:1:cell-a"

    request(manager, activeKey, vi.fn(), { scopeKey })
    request(manager, pendingKey, pendingExecute, { scopeKey })

    const confirm = manager.confirmPending()
    await Promise.resolve()

    manager.releaseExecution(wrongKey, scopeKey)
    await Promise.resolve()

    expect(pendingExecute).not.toHaveBeenCalled()
    expect(manager.getActive(scopeKey)?.queryKey).toBe(activeKey)

    manager.releaseExecution(activeKey, scopeKey)
    await confirm

    expect(pendingExecute).toHaveBeenCalledTimes(1)
    expect(manager.getActive(scopeKey)?.queryKey).toBe(pendingKey)
  })

  it("dismisses the visible pending execution when another scope opens the dialog", () => {
    const manager = createManager()
    const cellAFirstKey = "cell-a-first@0-12" as QueryKey
    const cellASecondKey = "cell-a-second@0-13" as QueryKey
    const cellBFirstKey = "cell-b-first@0-12" as QueryKey
    const cellBSecondKey = "cell-b-second@0-13" as QueryKey
    const onDismissA = vi.fn()

    request(manager, cellAFirstKey, vi.fn(), {
      scopeKey: "notebook:1:cell-a",
    })
    request(manager, cellASecondKey, vi.fn(), {
      scopeKey: "notebook:1:cell-a",
      onDismiss: onDismissA,
    })
    request(manager, cellBFirstKey, vi.fn(), {
      scopeKey: "notebook:1:cell-b",
    })
    request(manager, cellBSecondKey, vi.fn(), {
      scopeKey: "notebook:1:cell-b",
    })

    expect(onDismissA).toHaveBeenCalledTimes(1)
    expect(manager.getPending("notebook:1:cell-a")).toBeNull()
    expect(manager.getPending("notebook:1:cell-b")?.queryKey).toBe(
      cellBSecondKey,
    )
  })

  it("notifies subscribers when manager state changes", () => {
    const manager = createManager()
    const activeKey = "active@0-6" as QueryKey
    const pendingKey = "pending@0-7" as QueryKey
    const listener = vi.fn()

    const unsubscribe = manager.subscribe(listener)

    request(manager, activeKey)
    request(manager, pendingKey)
    manager.dismissPending()
    manager.releaseExecution(activeKey)

    expect(listener).toHaveBeenCalledTimes(4)

    unsubscribe()
    request(manager, "next@0-4" as QueryKey)

    expect(listener).toHaveBeenCalledTimes(4)
  })
})
