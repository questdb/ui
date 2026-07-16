import { beforeEach, describe, expect, it } from "vitest"
import {
  __resetNotebookBufferQueuesForTests,
  bufferQueueDepth,
  enqueueBufferTask,
} from "./notebookBufferQueue"

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("enqueueBufferTask", () => {
  beforeEach(() => {
    __resetNotebookBufferQueuesForTests()
  })

  it("runs tasks for one buffer strictly in FIFO order", async () => {
    // Given a first task that stays pending
    const gate = deferred<void>()
    const order: string[] = []
    const first = enqueueBufferTask(1, async () => {
      await gate.promise
      order.push("first")
    })
    // When a second task is enqueued while the first is still running
    const second = enqueueBufferTask(1, () => {
      order.push("second")
    })
    // Then the second waits for the first
    gate.resolve()
    await Promise.all([first, second])
    expect(order).toEqual(["first", "second"])
  })

  it("a rejected task surfaces to its caller but does not wedge the queue", async () => {
    // Given a task that throws
    const failing = enqueueBufferTask(1, () => {
      throw new Error("boom")
    })
    // When a follow-up task is enqueued behind it
    const following = enqueueBufferTask(1, () => "ok")
    // Then the failure reaches the first caller and the queue keeps going
    await expect(failing).rejects.toThrow("boom")
    await expect(following).resolves.toBe("ok")
  })

  it("queues for different buffers are independent", async () => {
    // Given buffer 1 blocked by a pending task
    const gate = deferred<void>()
    const blocked = enqueueBufferTask(1, () => gate.promise)
    const order: string[] = []
    // When a task runs on buffer 2
    await enqueueBufferTask(2, () => {
      order.push("buffer-2")
    })
    // Then it completes without waiting for buffer 1
    expect(order).toEqual(["buffer-2"])
    gate.resolve()
    await blocked
  })

  it("cleans up its map entry once a buffer's queue drains", async () => {
    // Given two queued tasks
    const first = enqueueBufferTask(1, () => undefined)
    const second = enqueueBufferTask(1, () => undefined)
    expect(bufferQueueDepth(1)).toBe(2)
    // When both settle
    await Promise.all([first, second])
    await Promise.resolve()
    // Then nothing is retained for the buffer
    expect(bufferQueueDepth(1)).toBe(0)
  })

  it("returns the task's value", async () => {
    // When a task resolves with a value
    const result = await enqueueBufferTask(1, () => 42)
    // Then the caller receives it
    expect(result).toBe(42)
  })
})
