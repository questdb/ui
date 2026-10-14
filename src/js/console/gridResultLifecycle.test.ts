import { afterEach, describe, expect, it, vi } from "vitest"
import { createGridResultLifecycle } from "./gridResultLifecycle"

afterEach(() => {
  vi.useRealTimers()
})

describe("legacy grid result lifecycle", () => {
  it("cancels deferred rendering and page-load timers when a result is replaced", () => {
    vi.useFakeTimers()
    const lifecycle = createGridResultLifecycle()
    const oldRender = vi.fn()
    const oldPage = vi.fn()
    const newRender = vi.fn()
    lifecycle.replaceResult(oldRender)
    lifecycle.schedulePageLoad(oldPage)
    lifecycle.replaceResult(newRender)
    vi.runAllTimers()
    expect(oldRender).not.toHaveBeenCalled()
    expect(oldPage).not.toHaveBeenCalled()
    expect(newRender).toHaveBeenCalledTimes(1)
  })

  it("drops old pagination and second-phase layout callbacks", () => {
    vi.useFakeTimers()
    const lifecycle = createGridResultLifecycle()
    const oldPage = vi.fn()
    const oldLayout = vi.fn()
    let finishLayout!: () => void
    lifecycle.replaceResult(() => {
      finishLayout = lifecycle.guard(oldLayout)
    })
    vi.advanceTimersByTime(0)
    const receivePage = lifecycle.guard(oldPage)
    lifecycle.replaceResult(vi.fn())
    receivePage({ dataset: [[1]] })
    finishLayout()
    expect(oldPage).not.toHaveBeenCalled()
    expect(oldLayout).not.toHaveBeenCalled()
  })

  it("keeps current callbacks and debounces page loads", () => {
    vi.useFakeTimers()
    const lifecycle = createGridResultLifecycle()
    const oldPage = vi.fn()
    const currentPage = vi.fn()
    lifecycle.replaceResult(vi.fn())
    lifecycle.schedulePageLoad(oldPage)
    lifecycle.schedulePageLoad(currentPage)
    vi.advanceTimersByTime(75)
    expect(oldPage).not.toHaveBeenCalled()
    expect(currentPage).toHaveBeenCalledTimes(1)
    const render = vi.fn()
    lifecycle.guard(render)({ dataset: [[2]] })
    expect(render).toHaveBeenCalledWith({ dataset: [[2]] })
  })
})
