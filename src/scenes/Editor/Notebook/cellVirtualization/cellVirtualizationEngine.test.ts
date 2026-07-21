import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NotebookCell } from "../../../../store/notebook"
import {
  CellVirtualizationEngine,
  type CellContentMode,
} from "./cellVirtualizationEngine"

vi.mock("../notebookScheduling", () => ({
  scheduleFrame: (callback: () => void) => setTimeout(callback, 16),
  scheduleIdle: (callback: () => void) => setTimeout(callback, 0),
}))

const FRAME_MS = 16
const DWELL_MS = 100

const sqlCell = (id: string): NotebookCell => ({
  id,
  position: 0,
  value: "select 1",
})

const markdownCell = (id: string): NotebookCell => ({
  id,
  position: 0,
  value: "# note",
  type: "markdown",
})

describe("CellVirtualizationEngine", () => {
  let engine: CellVirtualizationEngine
  let modeChanges: Array<[string, CellContentMode]>

  const enterMountBand = (cellId: string, distance = 0) => {
    engine.reportRetainBand(cellId, true)
    engine.reportMountBand(cellId, true, distance)
  }

  const trackModeChanges = (...cellIds: string[]) => {
    for (const cellId of cellIds) {
      engine.subscribe(cellId, () =>
        modeChanges.push([cellId, engine.getContentMode(cellId)]),
      )
    }
  }

  const mountFully = async (cellId: string) => {
    enterMountBand(cellId)
    await vi.advanceTimersByTimeAsync(DWELL_MS + FRAME_MS)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    modeChanges = []
    engine = new CellVirtualizationEngine({
      dwellMs: DWELL_MS,
      recentEditLimit: 2,
    })
  })

  afterEach(() => {
    engine.destroy()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("starts synced SQL cells as placeholders and never tracks markdown cells", async () => {
    // Given a notebook with an SQL cell and a markdown cell
    engine.sync([sqlCell("c1"), markdownCell("md1")])
    trackModeChanges("c1", "md1")

    // Then the SQL cell starts as a placeholder
    expect(engine.getContentMode("c1")).toBe("placeholder")

    // When the markdown cell enters the mount band and time passes
    enterMountBand("md1")
    await vi.advanceTimersByTimeAsync(DWELL_MS + FRAME_MS * 4)

    // Then the markdown cell never goes full — it has no entry at all
    expect(modeChanges).toEqual([])
  })

  it("mounts a cell entering the mount band after the dwell, not before", async () => {
    // Given a synced placeholder cell
    engine.sync([sqlCell("c1")])
    trackModeChanges("c1")

    // When it enters the mount band and less than the dwell passes
    enterMountBand("c1")
    await vi.advanceTimersByTimeAsync(DWELL_MS - 1)

    // Then it is still a placeholder
    expect(engine.getContentMode("c1")).toBe("placeholder")

    // When the dwell elapses and a frame runs
    await vi.advanceTimersByTimeAsync(FRAME_MS * 2)

    // Then the cell is full
    expect(engine.getContentMode("c1")).toBe("full")
    expect(modeChanges).toEqual([["c1", "full"]])
  })

  it("mounts one cell per frame, nearest to the viewport center first", async () => {
    // Given three placeholder cells entering the mount band at once
    engine.sync([sqlCell("far"), sqlCell("near"), sqlCell("mid")])
    trackModeChanges("far", "near", "mid")
    enterMountBand("far", 300)
    enterMountBand("near", 50)
    enterMountBand("mid", 150)

    // When the dwell elapses and frames run one at a time
    await vi.advanceTimersByTimeAsync(DWELL_MS + FRAME_MS)

    // Then only the nearest cell mounted on the first frame
    expect(modeChanges).toEqual([["near", "full"]])

    await vi.advanceTimersByTimeAsync(FRAME_MS)
    expect(modeChanges).toEqual([
      ["near", "full"],
      ["mid", "full"],
    ])

    await vi.advanceTimersByTimeAsync(FRAME_MS)
    expect(modeChanges).toEqual([
      ["near", "full"],
      ["mid", "full"],
      ["far", "full"],
    ])
  })

  it("never mounts a cell flung through the band faster than the dwell", async () => {
    // Given a placeholder cell that enters the mount band
    engine.sync([sqlCell("c1")])
    enterMountBand("c1")

    // When it leaves before the dwell elapses
    await vi.advanceTimersByTimeAsync(DWELL_MS / 2)
    engine.reportMountBand("c1", false, 500)

    // Then it never mounts, no matter how long passes
    await vi.advanceTimersByTimeAsync(DWELL_MS * 10)
    expect(engine.getContentMode("c1")).toBe("placeholder")
  })

  it("keeps a cell full between the mount and retain bands (hysteresis)", async () => {
    // Given a fully mounted cell
    engine.sync([sqlCell("c1")])
    await mountFully("c1")

    // When it leaves the mount band but stays inside the retain band
    engine.reportMountBand("c1", false, 800)
    await vi.advanceTimersByTimeAsync(1000)

    // Then it stays full
    expect(engine.getContentMode("c1")).toBe("full")
  })

  it("drops a cell when the retain exit is reported before the mount exit", async () => {
    // Given a fully mounted cell flung out of both bands in one observer tick,
    // with the retain observer reporting first (ordering is unspecified)
    engine.sync([sqlCell("c1")])
    await mountFully("c1")

    // When the reports arrive retain-first
    engine.reportRetainBand("c1", false)
    engine.reportMountBand("c1", false, 3000)
    await vi.advanceTimersByTimeAsync(1)

    // Then the drop still happens
    expect(engine.getContentMode("c1")).toBe("placeholder")
  })

  it("drops a cell to placeholder on idle once it leaves the retain band", async () => {
    // Given a fully mounted cell
    engine.sync([sqlCell("c1")])
    trackModeChanges("c1")
    await mountFully("c1")

    // When it leaves both bands
    engine.reportMountBand("c1", false, 2000)
    engine.reportRetainBand("c1", false)
    await vi.advanceTimersByTimeAsync(1)

    // Then it dropped to placeholder
    expect(engine.getContentMode("c1")).toBe("placeholder")
    expect(modeChanges).toEqual([
      ["c1", "full"],
      ["c1", "placeholder"],
    ])
  })

  it("drops at most one cell per idle tick", async () => {
    // Given two fully mounted cells
    engine.sync([sqlCell("c1"), sqlCell("c2")])
    enterMountBand("c1")
    enterMountBand("c2", 100)
    await vi.advanceTimersByTimeAsync(DWELL_MS + FRAME_MS * 2)
    expect(engine.getContentMode("c1")).toBe("full")
    expect(engine.getContentMode("c2")).toBe("full")

    // When both leave both bands at once
    engine.reportMountBand("c1", false, 3000)
    engine.reportRetainBand("c1", false)
    engine.reportMountBand("c2", false, 3000)
    engine.reportRetainBand("c2", false)

    // Then the first idle tick drops only the first cell
    await vi.advanceTimersToNextTimerAsync()
    expect(engine.getContentMode("c1")).toBe("placeholder")
    expect(engine.getContentMode("c2")).toBe("full")

    // And the next idle tick drops the second
    await vi.advanceTimersToNextTimerAsync()
    expect(engine.getContentMode("c2")).toBe("placeholder")
  })

  it("pins the focused cell full until focus moves away", async () => {
    // Given a mounted cell that becomes focused
    engine.sync([sqlCell("c1")])
    await mountFully("c1")
    engine.setFocusedCell("c1")

    // When it leaves both bands
    engine.reportMountBand("c1", false, 2000)
    engine.reportRetainBand("c1", false)
    await vi.advanceTimersByTimeAsync(1000)

    // Then it stays full while focused
    expect(engine.getContentMode("c1")).toBe("full")

    // When focus moves away
    engine.setFocusedCell(null)
    await vi.advanceTimersByTimeAsync(1)

    // Then it drops to placeholder
    expect(engine.getContentMode("c1")).toBe("placeholder")
  })

  it("pins the maximized cell full until it is restored", async () => {
    // Given a placeholder cell outside both bands that gets maximized
    engine.sync([sqlCell("c1")])
    engine.setMaximizedCell("c1")

    // Then it is full immediately
    expect(engine.getContentMode("c1")).toBe("full")

    // When it is restored
    engine.setMaximizedCell(null)
    await vi.advanceTimersByTimeAsync(1)

    // Then it drops back to placeholder
    expect(engine.getContentMode("c1")).toBe("placeholder")
  })

  it("keeps running cells full until the run ends", async () => {
    // Given a placeholder cell outside both bands that starts running
    engine.sync([sqlCell("c1")])
    engine.setRunningCells(["c1"])

    // Then it goes full immediately
    expect(engine.getContentMode("c1")).toBe("full")

    // When the run ends
    engine.setRunningCells([])
    await vi.advanceTimersByTimeAsync(1)

    // Then it drops to placeholder
    expect(engine.getContentMode("c1")).toBe("placeholder")
  })

  it("evicts the oldest recently-edited pin beyond the limit", async () => {
    // Given three cells edited in order, with a recent-edit limit of two
    engine.sync([sqlCell("c1"), sqlCell("c2"), sqlCell("c3")])
    engine.noteCellEdited("c1")
    engine.noteCellEdited("c2")
    engine.noteCellEdited("c3")
    await vi.advanceTimersByTimeAsync(1)

    // Then the oldest edit lost its pin and dropped; the newest two stay full
    expect(engine.getContentMode("c1")).toBe("placeholder")
    expect(engine.getContentMode("c2")).toBe("full")
    expect(engine.getContentMode("c3")).toBe("full")
  })

  it("mounts a reveal target immediately and unpins it on arrival", async () => {
    // Given a placeholder cell far outside both bands
    engine.sync([sqlCell("c1")])

    // When a reveal path ensures its content
    engine.ensureFullContent("c1")

    // Then it is full immediately, no dwell, no frame
    expect(engine.getContentMode("c1")).toBe("full")

    // When the scroll arrives and the cell later leaves both bands again
    engine.reportRetainBand("c1", true)
    engine.reportMountBand("c1", true, 0)
    engine.reportMountBand("c1", false, 2000)
    engine.reportRetainBand("c1", false)
    await vi.advanceTimersByTimeAsync(1)

    // Then the reveal pin is gone and it drops normally
    expect(engine.getContentMode("c1")).toBe("placeholder")
  })

  it("notifies an existing subscriber when sync creates its entry born full", () => {
    // Given a cell focused before sync, whose component already subscribed
    // against the default placeholder (child effects run before the provider's)
    engine.setFocusedCell("c1")
    const listener = vi.fn()
    engine.subscribe("c1", listener)

    // When sync creates the entry, born full through the focus pin
    engine.sync([sqlCell("c1")])

    // Then the subscriber hears about it and reads the real mode
    expect(listener).toHaveBeenCalled()
    expect(engine.getContentMode("c1")).toBe("full")
  })

  it("releases the reveal pin of an out-of-band cell so it can drop", async () => {
    // Given a cell revealed while far outside both bands (e.g. focus tabbed in)
    engine.sync([sqlCell("c1")])
    engine.ensureFullContent("c1")
    expect(engine.getContentMode("c1")).toBe("full")
    expect(engine.isInBand("c1")).toBe(false)

    // When the pin is released (focus left the cell)
    engine.releaseRevealPin("c1")
    await vi.advanceTimersByTimeAsync(1)

    // Then the cell drops back to a placeholder
    expect(engine.getContentMode("c1")).toBe("placeholder")
  })

  it("reports band membership for in-band and out-of-band cells", () => {
    // Given a synced cell inside the retain band only
    engine.sync([sqlCell("c1"), sqlCell("c2")])
    engine.reportRetainBand("c1", true)

    // Then only that cell counts as in-band
    expect(engine.isInBand("c1")).toBe(true)
    expect(engine.isInBand("c2")).toBe(false)
  })

  it("notifies subscribers on every mode change", async () => {
    // Given a subscriber on a synced cell
    engine.sync([sqlCell("c1")])
    const listener = vi.fn()
    engine.subscribe("c1", listener)

    // When the cell mounts
    await mountFully("c1")

    // Then the subscriber was notified of the flip to full
    expect(listener).toHaveBeenCalledTimes(1)
    expect(engine.getContentMode("c1")).toBe("full")
  })

  it("cleans up removed cells and their engine-owned pins", () => {
    // Given a cell pinned full by a recent edit
    engine.sync([sqlCell("c1")])
    engine.noteCellEdited("c1")
    expect(engine.getContentMode("c1")).toBe("full")

    // When the cell is removed from the notebook
    engine.sync([])

    // Then its entry is gone and mode falls back to placeholder
    expect(engine.getContentMode("c1")).toBe("placeholder")

    // And re-adding it starts fresh as a placeholder — the edit pin is gone
    engine.sync([sqlCell("c1")])
    expect(engine.getContentMode("c1")).toBe("placeholder")
  })
})

describe("CellVirtualizationEngine data callbacks", () => {
  let engine: CellVirtualizationEngine
  let dataNeeded: string[]
  let dataReleasable: string[]

  beforeEach(() => {
    vi.useFakeTimers()
    dataNeeded = []
    dataReleasable = []
    engine = new CellVirtualizationEngine({
      dwellMs: DWELL_MS,
      onCellDataNeeded: (cellId) => dataNeeded.push(cellId),
      onCellDataReleasable: (cellId) => dataReleasable.push(cellId),
    })
  })

  afterEach(() => {
    engine.destroy()
    vi.useRealTimers()
  })

  it("reports data needed when a cell enters the retain band", () => {
    // Given a synced placeholder cell
    engine.sync([sqlCell("c1")])

    // When it enters the retain band
    engine.reportRetainBand("c1", true)

    // Then its data is requested ahead of the mount band
    expect(dataNeeded).toEqual(["c1"])
  })

  it("reports data needed when sync creates a cell already pinned", () => {
    // Given the reload-focused cell, pinned before its entry exists
    engine.setFocusedCell("c1")

    // When sync creates its entry directly in full mode
    engine.sync([sqlCell("c1")])

    // Then its data is requested immediately
    expect(engine.getContentMode("c1")).toBe("full")
    expect(dataNeeded).toEqual(["c1"])
  })

  it("reports data needed when a cell is promoted to full content", () => {
    // Given a synced placeholder cell outside the retain band
    engine.sync([sqlCell("c1")])

    // When a reveal forces it to full content
    engine.ensureFullContent("c1")

    // Then its data is requested by the promotion
    expect(dataNeeded).toEqual(["c1"])
  })

  it("reports data releasable when an unpinned cell leaves the retain band", async () => {
    // Given a fully mounted cell
    engine.sync([sqlCell("c1")])
    engine.reportRetainBand("c1", true)
    engine.reportMountBand("c1", true, 0)
    await vi.advanceTimersByTimeAsync(DWELL_MS + FRAME_MS)

    // When it leaves both bands
    engine.reportMountBand("c1", false, 3000)
    engine.reportRetainBand("c1", false)

    // Then its data is reported releasable
    expect(dataReleasable).toEqual(["c1"])
  })

  it("reports data releasable for a placeholder cell that leaves the retain band", () => {
    // Given a cell hydrated by retain-band entry but never mounted
    engine.sync([sqlCell("c1")])
    engine.reportRetainBand("c1", true)
    expect(engine.getContentMode("c1")).toBe("placeholder")

    // When it leaves the retain band
    engine.reportRetainBand("c1", false)

    // Then its data is reported releasable even though no content drop happens
    expect(dataReleasable).toEqual(["c1"])
  })

  it("does not report data releasable while the cell is pinned or inside a band", () => {
    // Given a focused, fully mounted cell
    engine.sync([sqlCell("c1")])
    engine.setFocusedCell("c1")
    engine.reportRetainBand("c1", true)
    engine.reportMountBand("c1", true, 0)

    // When it leaves the mount band but stays in the retain band
    engine.reportMountBand("c1", false, 800)
    expect(dataReleasable).toEqual([])

    // And when it leaves the retain band while still focused
    engine.reportRetainBand("c1", false)

    // Then the pin keeps its data resident
    expect(dataReleasable).toEqual([])
  })

  it("reports data releasable when the last pin is removed outside the bands", () => {
    // Given a focused cell outside both bands
    engine.sync([sqlCell("c1")])
    engine.setFocusedCell("c1")
    engine.reportRetainBand("c1", false)
    expect(dataReleasable).toEqual([])

    // When focus moves away
    engine.setFocusedCell(null)

    // Then its data becomes releasable
    expect(dataReleasable).toEqual(["c1"])
  })

  it("canReleaseData follows bands and pins", () => {
    // Given a synced cell inside the retain band
    engine.sync([sqlCell("c1")])
    engine.reportRetainBand("c1", true)
    expect(engine.canReleaseData("c1")).toBe(false)

    // When it leaves the band, release is allowed
    engine.reportRetainBand("c1", false)
    expect(engine.canReleaseData("c1")).toBe(true)

    // But not while pinned
    engine.setFocusedCell("c1")
    expect(engine.canReleaseData("c1")).toBe(false)
  })
})
