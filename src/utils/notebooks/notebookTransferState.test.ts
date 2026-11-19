import { afterEach, describe, expect, it, vi } from "vitest"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import type { NotebookResultSnapshot } from "../../store/notebookResults"
import {
  consumeTransferMonitor,
  hasTransferSnapshot,
  newerTransferSnapshot,
  requestTransferMonitor,
  stageTransferSnapshot,
  subscribeTransferMonitor,
  takeTransferSnapshot,
} from "./notebookTransferState"

const snapshot = (cellId = "cell"): NotebookResultSnapshot => ({
  bufferId: 1,
  cellId,
  savedAt: 123,
  results: [
    {
      type: "dql",
      query: "select 1",
      columns: [{ name: "x", type: "LONG" }],
      dataset: [[1]],
      count: 1,
      fetchedAt: 100,
    },
  ],
})

afterEach(() => {
  authSessionState.endSession()
  vi.useRealTimers()
})

describe("notebook transfer handoff", () => {
  it("consumes a frame only for its destination, with its original fetch time", () => {
    const frame = snapshot()
    stageTransferSnapshot(frame)
    expect(hasTransferSnapshot(1, "cell")).toBe(true)
    expect(takeTransferSnapshot(2, "cell")).toBeUndefined()
    expect(takeTransferSnapshot(1, "another")).toBeUndefined()
    expect(takeTransferSnapshot(1, "cell")).toBe(frame)
    expect(hasTransferSnapshot(1, "cell")).toBe(false)
    expect(takeTransferSnapshot(1, "cell")).toBeUndefined()
  })

  it("does not resurrect expired frames or data from an ended session", () => {
    vi.useFakeTimers()
    stageTransferSnapshot(snapshot())
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(takeTransferSnapshot(1, "cell")).toBeUndefined()
    stageTransferSnapshot(snapshot())
    requestTransferMonitor(1, "cell")
    authSessionState.endSession()
    expect(takeTransferSnapshot(1, "cell")).toBeUndefined()
    expect(consumeTransferMonitor(1, "cell")).toBe(false)
  })

  it("opens only the requested cell's menu, once, including after mount", () => {
    const listener = vi.fn()
    const unsubscribe = subscribeTransferMonitor(listener)
    requestTransferMonitor(1, "cell")
    expect(listener).toHaveBeenCalledTimes(1)
    expect(consumeTransferMonitor(2, "cell")).toBe(false)
    expect(consumeTransferMonitor(1, "another")).toBe(false)
    expect(consumeTransferMonitor(1, "cell")).toBe(true)
    expect(consumeTransferMonitor(1, "cell")).toBe(false)
    unsubscribe()
    requestTransferMonitor(1, "later")
    expect(listener).toHaveBeenCalledTimes(1)
    expect(consumeTransferMonitor(1, "later")).toBe(true)
  })

  it("evicts old frames to stay within the memory budget", () => {
    const large = (cellId: string) =>
      ({
        ...snapshot(cellId),
        results: [
          { ...snapshot().results[0], dataset: [["x".repeat(17_000_000)]] },
        ],
      }) as NotebookResultSnapshot
    stageTransferSnapshot(large("first"))
    stageTransferSnapshot(large("second"))
    expect(takeTransferSnapshot(1, "first")).toBeUndefined()
    expect(takeTransferSnapshot(1, "second")).toBeDefined()
  })
})

describe("newerTransferSnapshot", () => {
  const at = (savedAt: number): NotebookResultSnapshot => ({
    ...snapshot(),
    savedAt,
  })

  it("prefers a result saved after the transfer", () => {
    // The cell ran again, e.g. by an agent while the notebook was not open.
    const saved = at(200)
    expect(newerTransferSnapshot(at(123), saved)).toBe(saved)
  })

  it("keeps the staged frame otherwise", () => {
    const staged = at(123)
    expect(newerTransferSnapshot(staged, at(123))).toBe(staged)
    expect(newerTransferSnapshot(staged, undefined)).toBe(staged)
  })
})
