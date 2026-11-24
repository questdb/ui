import { describe, expect, it, vi } from "vitest"
import type { EChartsType } from "echarts"
import type { NotebookCell } from "../../store/notebook"
import type { RenderReport } from "../../scenes/Editor/Notebook/renderReports"
import { cellImage, type CellImageDeps } from "./cellImageTool"

const drawCell = (over: Partial<NotebookCell> = {}) =>
  ({
    id: "c",
    value: "SELECT 1",
    position: 0,
    mode: "draw",
    chartConfig: { xColumn: null, queries: [] },
    ...over,
  }) as NotebookCell

const instance = {} as EChartsType
const picture = { data: "QUJD", width: 800, height: 400 }
const report = {
  kind: "chart" as const,
  status: "drawn" as const,
  drawn: { series: 1 },
  problems: [],
  at: Date.now(),
}

const deps = (over: Partial<CellImageDeps> = {}): CellImageDeps => ({
  readCells: () => Promise.resolve([drawCell()]),
  liveView: () => Promise.resolve({ maximizedCellId: null }),
  chartOf: () => instance,
  bringIntoView: () => () => undefined,
  waitForChart: () => Promise.resolve(instance),
  settle: () => Promise.resolve(),
  picture: () => picture,
  reportOf: () => report,
  ...over,
})

describe("get_cell_image", () => {
  it("pictures a drawn chart with its render report", async () => {
    // Given / When
    const result = await cellImage(1, "c", deps())

    // Then
    expect(result.picture).toBe(picture)
    expect(result.body).toMatchObject({
      picture: true,
      width: 800,
      height: 400,
      render_report: { kind: "chart", drawn: { series: 1 } },
    })
  })

  it("brings a cell scrolled away into view, waits for it to draw in, and puts the scroll back", async () => {
    // Given a cell with no chart until it is in view
    const restore = vi.fn()
    const settle = vi.fn(() => Promise.resolve())
    const d = deps({
      chartOf: () => null,
      bringIntoView: vi.fn(() => restore),
      settle,
    })

    // When
    const result = await cellImage(1, "c", d)

    // Then
    expect(d.bringIntoView).toHaveBeenCalledWith("c")
    expect(settle).toHaveBeenCalledWith(instance, undefined)
    expect(restore).toHaveBeenCalledOnce()
    expect(result.body.picture).toBe(true)
  })

  it("says the cell draws no chart when its chart is replaced while it settles", async () => {
    // Given a chart disposed while it draws in (e.g. a theme change)
    const replaced = { isDisposed: () => true } as unknown as EChartsType
    const picture = vi.fn()
    const d = deps({
      chartOf: () => null,
      waitForChart: () => Promise.resolve(replaced),
      picture,
    })

    // When
    const result = await cellImage(1, "c", d)

    // Then no picture is taken of it, and the agent is told why
    expect(picture).not.toHaveBeenCalled()
    expect(result.picture).toBeNull()
    expect(result.body).toMatchObject({ picture: false })
  })

  it.each([
    undefined,
    report,
    {
      ...report,
      kind: "visual" as const,
      drawn: { type: "stat", tiles: 5 },
      visualConfig: { type: "stat" as const, columns: { value: "old" } },
    },
  ])(
    "reveals a current HTML visual even when a different chart report is cached (%s)",
    async (cached) => {
      const restore = vi.fn()
      let revealed = false
      const d = deps({
        readCells: () =>
          Promise.resolve([
            drawCell({
              chartConfig: {
                xColumn: null,
                queries: [],
                visual: { type: "stat" },
              },
            }),
          ]),
        reportOf: () =>
          revealed
            ? {
                ...report,
                kind: "visual",
                drawn: { type: "stat", tiles: 1 },
                visualConfig: { type: "stat" },
              }
            : cached,
        bringIntoView: vi.fn(() => {
          revealed = true
          return restore
        }),
        waitForChart: vi.fn(),
      })
      const result = await cellImage(1, "c", d)
      expect(d.bringIntoView).toHaveBeenCalledWith("c")
      expect(d.waitForChart).not.toHaveBeenCalled()
      expect(restore).toHaveBeenCalledOnce()
      expect(result.body).toMatchObject({
        picture: false,
        render_report: { kind: "visual", drawn: { type: "stat", tiles: 1 } },
      })
    },
  )

  it("waits for an HTML visual whose draw is pending, and says so if it stays pending", async () => {
    // Given a stat visual whose report says its draw is pending
    const stat = drawCell({
      chartConfig: { xColumn: null, queries: [], visual: { type: "stat" } },
    })
    const pending = {
      ...report,
      kind: "visual" as const,
      status: "waiting" as const,
      drawn: { type: "stat" },
      visualConfig: { type: "stat" as const },
    }
    let current: RenderReport = pending
    const d = deps({
      readCells: () => Promise.resolve([stat]),
      reportOf: () => current,
      bringIntoView: vi.fn(() => {
        // The draw lands once the cell is in view
        setTimeout(() => {
          current = { ...pending, status: "drawn", drawn: { type: "stat" } }
        }, 150)
        return () => undefined
      }),
    })

    // When the agent asks for its picture
    const result = await cellImage(1, "c", d)

    // Then it waited for the draw rather than answering with the pending one
    expect(d.bringIntoView).toHaveBeenCalledWith("c")
    expect(result.body).toMatchObject({
      render_report: { status: "drawn" },
    })
  })

  it("says why there is no picture", async () => {
    // Given / When
    const html = await cellImage(
      1,
      "c",
      deps({
        reportOf: () => ({
          ...report,
          kind: "visual",
          visualConfig: { type: "stat" },
          drawn: { type: "stat", tiles: 1 },
        }),
        readCells: () =>
          Promise.resolve([
            drawCell({
              chartConfig: {
                xColumn: null,
                queries: [],
                visual: { type: "stat" },
              },
            }),
          ]),
      }),
    )
    const nothing = await cellImage(
      1,
      "c",
      deps({ chartOf: () => null, waitForChart: () => Promise.resolve(null) }),
    )
    const tooLarge = await cellImage(1, "c", deps({ picture: () => null }))

    // Then
    expect(html.body).toMatchObject({
      picture: false,
      reason: expect.stringMatching(
        /stat component is drawn in HTML/,
      ) as string,
      render_report: { kind: "visual" },
    })
    expect(nothing.body.reason).toMatch(/draws no chart right now/)
    expect(tooLarge.body.reason).toMatch(/too large/)
    expect([html, nothing, tooLarge].every((r) => r.picture === null)).toBe(
      true,
    )
  })

  it("refuses cells it cannot picture, naming the way forward", async () => {
    // Given / When / Then
    await expect(cellImage(1, "x", deps())).rejects.toMatchObject({
      code: "unknown_cell",
    })
    await expect(
      cellImage(
        1,
        "c",
        deps({
          readCells: () => Promise.resolve([drawCell({ mode: undefined })]),
        }),
      ),
    ).rejects.toThrow(/set_cell_mode/)
    await expect(
      cellImage(1, "c", deps({ liveView: () => Promise.resolve(null) })),
    ).rejects.toThrow(/activate_notebook/)
    await expect(
      cellImage(
        1,
        "c",
        deps({ liveView: () => Promise.resolve({ maximizedCellId: "other" }) }),
      ),
    ).rejects.toThrow(/other is maximized.*set_cell_maximized/)
  })

  it("puts the scroll back when the wait is cancelled", async () => {
    // Given a cancelled wait for a cell brought into view
    const restore = vi.fn()
    const d = deps({
      chartOf: () => null,
      bringIntoView: () => restore,
      waitForChart: () => Promise.reject(new Error("aborted")),
    })

    // When / Then
    await expect(cellImage(1, "c", d)).rejects.toThrow("aborted")
    expect(restore).toHaveBeenCalledOnce()
  })
})
