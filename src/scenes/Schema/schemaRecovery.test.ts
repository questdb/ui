import { afterEach, describe, expect, it, vi } from "vitest"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { subscribeSchemaRecovery } from "./schemaRecovery"

const cleanups: Array<() => void> = []
const subscribe = (recover: Parameters<typeof subscribeSchemaRecovery>[0]) => {
  const unsubscribe = subscribeSchemaRecovery(recover)
  cleanups.push(unsubscribe)
  return unsubscribe
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
const success = () => eventBus.publish(EventType.MSG_CONNECTION_OK)

afterEach(() => {
  cleanups.splice(0).forEach((unsubscribe) => unsubscribe())
})

describe("shared Schema recovery", () => {
  it("waits for every panel even when a companion recovery rejects", async () => {
    let finish!: () => void
    const failed = vi.fn(() => Promise.reject(new Error("Unavailable")))
    const pending = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    subscribe(failed)
    subscribe(pending)
    success()
    await flush()
    expect(failed).toHaveBeenCalledOnce()
    expect(pending).toHaveBeenCalledOnce()
    success()
    await flush()
    expect(failed).toHaveBeenCalledOnce()
    expect(pending).toHaveBeenCalledOnce()
    finish()
    await flush()
    success()
    await flush()
    expect(failed).toHaveBeenCalledTimes(2)
    expect(pending).toHaveBeenCalledTimes(2)
    finish()
    await flush()
  })

  it("does not invoke a panel removed before the batch starts", async () => {
    const recover = vi.fn(() => Promise.resolve())
    const unsubscribe = subscribe(recover)
    success()
    unsubscribe()
    await flush()
    success()
    await flush()
    expect(recover).not.toHaveBeenCalled()
  })

  it("does not let a removed batch block or release a replacement batch", async () => {
    let finishOld!: () => void
    const old = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishOld = resolve
        }),
    )
    const unsubscribe = subscribe(old)
    success()
    await flush()
    unsubscribe()

    let finishNew!: () => void
    const current = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishNew = resolve
        }),
    )
    subscribe(current)
    success()
    await flush()
    expect(current).toHaveBeenCalledOnce()
    finishOld()
    await flush()
    success()
    await flush()
    expect(current).toHaveBeenCalledOnce()
    finishNew()
    await flush()
    success()
    await flush()
    expect(current).toHaveBeenCalledTimes(2)
    finishNew()
    await flush()
  })
})
