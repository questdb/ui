import { describe, it, expect, vi } from "vitest"
import { createRequestLimiter } from "./requestLimiter"

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe("createRequestLimiter", () => {
  it("never exceeds the active cap across queued tasks", async () => {
    // Given a limiter with a cap of 2 and 5 competing tasks
    const limit = createRequestLimiter(2)
    let active = 0
    let maxActive = 0
    const tasks = Array.from({ length: 5 }, (_, i) =>
      limit(async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await Promise.resolve()
        active--
        return i
      }),
    )

    // When all tasks complete
    const results = await Promise.all(tasks)

    // Then concurrency saturated the cap without exceeding it
    expect(maxActive).toBe(2)
    expect(results).toEqual([0, 1, 2, 3, 4])
  })

  it("a queued task aborted before its permit never executes", async () => {
    // Given a saturated limiter with a second task waiting
    const limit = createRequestLimiter(1)
    const gate = deferred()
    const first = limit(() => gate.promise)
    const queuedTask = vi.fn(() => Promise.resolve("never"))
    const controller = new AbortController()
    const queued = limit(queuedTask, controller.signal)

    // When the waiting caller aborts
    controller.abort()

    // Then it rejects without executing, and the permit still recycles
    await expect(queued).rejects.toMatchObject({ name: "AbortError" })
    expect(queuedTask).not.toHaveBeenCalled()
    gate.resolve()
    await first
    await expect(limit(() => Promise.resolve("ok"))).resolves.toBe("ok")
  })

  it("preserves FIFO order after removing the queue head, middle and tail", async () => {
    const limit = createRequestLimiter(1)
    const gate = deferred()
    const first = limit(() => gate.promise)
    const order: string[] = []
    const controllers = Array.from({ length: 5 }, () => new AbortController())
    const queued = ["head", "first", "middle", "second", "tail"].map(
      (label, index) =>
        limit(() => {
          order.push(label)
          return Promise.resolve(label)
        }, controllers[index].signal),
    )
    const settled = Promise.allSettled(queued)

    for (const index of [0, 2, 4]) controllers[index].abort("cancelled")
    const appended = limit(() => {
      order.push("appended")
      return Promise.resolve("appended")
    })
    gate.resolve()
    await first

    expect(await settled).toEqual([
      { status: "rejected", reason: "cancelled" },
      { status: "fulfilled", value: "first" },
      { status: "rejected", reason: "cancelled" },
      { status: "fulfilled", value: "second" },
      { status: "rejected", reason: "cancelled" },
    ])
    await expect(appended).resolves.toBe("appended")
    expect(order).toEqual(["first", "second", "appended"])
  })

  it("bulk cancellation preserves unrelated waiters and recycles every permit", async () => {
    const limit = createRequestLimiter(2)
    const gates = [deferred(), deferred()]
    const occupied = gates.map((gate) => limit(() => gate.promise))
    const order: string[] = []
    const before = limit(() => {
      order.push("before")
      return Promise.resolve()
    })
    const task = vi.fn(() => Promise.resolve())
    const controllers = Array.from(
      { length: 1_024 },
      () => new AbortController(),
    )
    const settled = Promise.allSettled(
      controllers.map((controller) => limit(task, controller.signal)),
    )
    const after = limit(() => {
      order.push("after")
      return Promise.resolve()
    })

    controllers.forEach((controller) => controller.abort("notebook-unmounted"))

    expect(await settled).toEqual(
      controllers.map(() => ({
        status: "rejected",
        reason: "notebook-unmounted",
      })),
    )
    expect(task).not.toHaveBeenCalled()
    gates.forEach((gate) => gate.resolve())
    await Promise.all([...occupied, before, after])
    expect(order).toEqual(["before", "after"])

    let active = 0
    let maxActive = 0
    await Promise.all(
      Array.from({ length: 4 }, () =>
        limit(async () => {
          active++
          maxActive = Math.max(maxActive, active)
          await Promise.resolve()
          active--
        }),
      ),
    )
    expect(maxActive).toBe(2)
  })

  it("removes a waiter's abort listener when granting its permit", async () => {
    const limit = createRequestLimiter(1)
    const firstGate = deferred()
    const first = limit(() => firstGate.promise)
    const controller = new AbortController()
    const removeListener = vi.spyOn(controller.signal, "removeEventListener")
    const started = deferred()
    const secondGate = deferred()
    const second = limit(() => {
      started.resolve()
      return secondGate.promise
    }, controller.signal)
    const lastTask = vi.fn(() => Promise.resolve("last"))
    const last = limit(lastTask)

    firstGate.resolve()
    await first
    await started.promise
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function))

    controller.abort()
    await Promise.resolve()
    expect(lastTask).not.toHaveBeenCalled()
    secondGate.resolve()
    await second
    await expect(last).resolves.toBe("last")
  })

  it("an already-aborted signal rejects before taking a permit", async () => {
    // Given a free limiter and an aborted caller
    const limit = createRequestLimiter(1)
    const controller = new AbortController()
    controller.abort()
    const task = vi.fn(() => Promise.resolve("never"))

    // When the aborted caller submits a task
    // Then it rejects and the task never runs
    await expect(limit(task, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    })
    expect(task).not.toHaveBeenCalled()
  })

  it("an abort between the permit grant and the task start prevents execution", async () => {
    // Given a caller whose permit is granted synchronously
    const limit = createRequestLimiter(1)
    const controller = new AbortController()
    const task = vi.fn(() => Promise.resolve("never"))
    const pending = limit(task, controller.signal)

    // When it aborts before the task starts
    controller.abort()

    // Then the task never runs and the permit is released
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(task).not.toHaveBeenCalled()
    await expect(limit(() => Promise.resolve("ok"))).resolves.toBe("ok")
  })
})
