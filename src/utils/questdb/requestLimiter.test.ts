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
