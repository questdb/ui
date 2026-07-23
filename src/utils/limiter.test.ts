import { describe, expect, it } from "vitest"
import { createLimiter } from "./limiter"

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("createLimiter", () => {
  it("runs at most the configured number of tasks concurrently", async () => {
    // Given a limiter of 2 and three hanging tasks
    const limit = createLimiter(2)
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()]
    let started = 0
    const run = (gate: Promise<void>) =>
      limit(async () => {
        started++
        await gate
      })
    const tasks = gates.map((gate) => run(gate.promise))

    // When all three are submitted
    await Promise.resolve()

    // Then only two start; the third waits for a slot
    expect(started).toBe(2)

    // When one finishes
    gates[0].resolve()
    await tasks[0]

    // Then the queued task starts
    expect(started).toBe(3)
    gates[1].resolve()
    gates[2].resolve()
    await Promise.all(tasks)
  })

  it("returns the task's value", async () => {
    // Given a limiter
    const limit = createLimiter(1)

    // When a task resolves a value through it
    // Then the caller receives that value
    await expect(limit(() => Promise.resolve(42))).resolves.toBe(42)
  })

  it("frees the slot when a task rejects", async () => {
    // Given a limiter of 1 whose first task rejects
    const limit = createLimiter(1)
    await expect(
      limit(() => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom")

    // When another task runs afterwards
    // Then the slot was released and it completes
    await expect(limit(() => Promise.resolve("ok"))).resolves.toBe("ok")
  })
})
