// @vitest-environment jsdom
import React from "react"
import { act, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import type { CellResult, NotebookCell } from "../../../../store/notebook"
import { clearRenderReport } from "../renderReports"
import { serializeCell } from "../../../../utils/ai/notebookSnapshot"

const BUFFER_ID = 46

vi.mock("../cellRefresh/CellRefreshContext", async (orig) => {
  const actual = await orig<Record<string, unknown>>()
  const engine = await import("../cellRefresh/cellRefreshEngine")
  return {
    ...actual,
    // A settled fetch for the cell's current SQL (settledKey === queriesKey).
    // Tests may override the block, Stop and settle state the engine reports.
    useCellFetchSelector: (_id: string, select: (s: unknown) => unknown) => {
      const g = globalThis as unknown as {
        __sql: string
        __fetch?: {
          classifyBlock?: unknown
          fetchCancelled?: boolean
          settled?: boolean
        }
      }
      // One state per SQL, so its queries keep their identity across renders
      // as the engine's do.
      const g2 = globalThis as unknown as { __states?: Map<string, unknown> }
      const cache = (g2.__states ??= new Map())
      const fresh = engine.pendingCellFetchState(g.__sql)
      const s = (cache.get(g.__sql) as typeof fresh | undefined) ?? fresh
      cache.set(g.__sql, s)
      const o = g.__fetch ?? {}
      return select({
        ...s,
        settledKey: o.settled === false ? null : s.queriesKey,
        ...(o.classifyBlock ? { classifyBlock: o.classifyBlock } : {}),
        ...(o.fetchCancelled ? { fetchCancelled: true } : {}),
      })
    },
  }
})
vi.mock("../cells/useChartLoading", () => ({
  useChartLoading: () => ({ loading: false, stopVisible: false }),
}))
const actions = {
  setVariableValues: (_values: Record<string, string>) => undefined,
  updateSettings: () => undefined,
  getVariables: () => [],
}
const state = { settings: {} }
vi.mock("../NotebookProvider", () => ({
  useNotebookActions: () => actions,
  useNotebookBufferId: () => 46,
  useNotebookSettings: () => state.settings,
}))
vi.mock("../CellChart/lazyCharts", () => ({
  ChartSuspense: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  LazyChartRenderer: React.forwardRef(() => <div data-hook="stub-chart" />),
  LazyCustomChart: () => <div />,
  LazyVisualCanvas: (props: { events?: Record<string, unknown> }) => {
    ;(globalThis as unknown as { __visualEvents?: unknown }).__visualEvents =
      props.events
    return <div />
  },
  preloadChartCode: () => undefined,
}))
vi.mock("../CellChart/DrawSettingsDrawer", () => ({
  DrawSettingsDrawer: () => null,
}))

import { DrawCanvas } from "./index"

const SQL = "SELECT ts, price FROM trades WHERE ts > dateadd('h', -1, now())"

const dql = (rows: number): CellResult => ({
  results: [
    {
      type: "dql",
      query: SQL,
      columns: [
        { name: "ts", type: "TIMESTAMP" },
        { name: "price", type: "DOUBLE" },
      ],
      dataset: Array.from({ length: rows }, (_, i) => [
        `2026-01-01T00:0${i}:00.000000Z`,
        100 + i,
      ]),
      count: rows,
      fetchedAt: 1,
    },
  ],
  activeResultIndex: 0,
  timestamp: rows + 1,
})

const failed: CellResult = {
  results: [{ type: "error", query: SQL, error: "table does not exist" }],
  activeResultIndex: 0,
  timestamp: 99,
} as unknown as CellResult

const cellWith = (result: CellResult): NotebookCell => ({
  id: "c1",
  position: 0,
  value: SQL,
  mode: "draw",
  result,
})

const ui = (cell: NotebookCell) => (
  <DrawCanvas
    cell={cell}
    isFocused={false}
    refreshIntervalMs={undefined}
    onSettingsChange={() => undefined}
    onRetryUnmountWhileFocused={() => undefined}
  />
)

const getCell = (cell: NotebookCell) =>
  serializeCell([cell], cell.id, BUFFER_ID, false, undefined, "loaded")

afterEach(() => {
  clearRenderReport(BUFFER_ID, "c1")
  ;(globalThis as unknown as { __fetch?: unknown }).__fetch = undefined
})

describe("DrawCanvas render report", () => {
  it.each([
    ["no rows", dql(0), "No data to plot.", "warning"],
    [
      "a failed statement",
      failed,
      "Query failed: check the SQL editor for the error.",
      "error",
    ],
  ] as const)(
    "replaces the previous draw's report when a re-run settles with %s",
    (_label, next, message, severity) => {
      ;(globalThis as unknown as { __sql: string }).__sql = SQL
      const first = cellWith(dql(5))
      const { rerender } = renderComponent(ui(first))
      expect(getCell(first).render_report?.drawn).toEqual({
        series: 1,
        points: 5,
        events: 0,
      })

      const second = cellWith(next)
      act(() => {
        rerender(ui(second))
      })
      expect(screen.getAllByText(message).length).toBeGreaterThan(0)
      const report = getCell(second).render_report
      expect(report?.kind).toBe("chart")
      expect(report?.drawn).toEqual({})
      expect(report?.problems).toEqual([{ message, severity }])
    },
  )

  it.each([
    [
      "its SQL becomes a write",
      "INSERT INTO trades VALUES (now(), 1)",
      { classifyBlock: { kind: "write", queryType: "INSERT" } },
      "Cannot draw a write query ('INSERT'). Switch to Run mode to execute this SQL.",
      "error",
    ],
    [
      "its SQL cannot be classified",
      SQL,
      { classifyBlock: { kind: "failed", message: "validate failed" } },
      "Cannot classify cell SQL (validate failed). Refusing to draw until the query can be classified safely.",
      "error",
    ],
    [
      "its next draw is stopped",
      SQL,
      { fetchCancelled: true, settled: false },
      "Chart loading was cancelled.",
      "warning",
    ],
  ] as const)(
    "replaces the previous draw's report when %s",
    (_label, sql, fetch, message, severity) => {
      const g = globalThis as unknown as { __sql: string; __fetch?: unknown }
      g.__sql = SQL
      const first = cellWith(dql(5))
      const { rerender } = renderComponent(ui(first))
      expect(getCell(first).render_report?.drawn).toEqual({
        series: 1,
        points: 5,
        events: 0,
      })

      // When the cell is blocked or its draw is stopped with nothing drawn
      g.__sql = sql
      g.__fetch = fetch
      const second = { ...cellWith(dql(0)), value: sql, result: undefined }
      act(() => {
        rerender(ui(second))
      })

      // Then the agent reads the state the pane shows, not the old chart
      const report = getCell(second).render_report
      expect(report?.drawn).toEqual({})
      expect(report?.problems).toEqual([{ message, severity }])
    },
  )

  it("writes the drawn report again once a blocked chart draws the same rows", () => {
    // Given a chart that drew, then could not be classified on the next round
    const g = globalThis as unknown as { __sql: string; __fetch?: unknown }
    g.__sql = SQL
    const cell = cellWith(dql(5))
    const { rerender } = renderComponent(ui(cell))
    g.__fetch = {
      classifyBlock: { kind: "failed", message: "Service Unavailable" },
    }
    act(() => {
      rerender(ui(cell))
    })
    expect(getCell(cell).render_report?.problems[0]?.severity).toBe("error")

    // When a later round classifies it and returns the rows it already holds
    g.__fetch = undefined
    act(() => {
      rerender(ui(cell))
    })

    // Then the agent reads the chart the pane shows again
    const report = getCell(cell).render_report
    expect(report?.drawn).toEqual({ series: 1, points: 5, events: 0 })
    expect(report?.problems).toEqual([])
  })

  it("does not report an edited cell as empty before the engine takes up its SQL", () => {
    // Given a chart that drew
    const g = globalThis as unknown as { __sql: string }
    g.__sql = SQL
    const first = cellWith(dql(5))
    const { rerender } = renderComponent(ui(first))

    // When the agent edits its SQL, which drops the result while the engine
    // still holds the old SQL for its debounce
    const edited = {
      ...first,
      value: "SELECT ts, price FROM trades LIMIT 3",
      result: undefined,
    }
    act(() => {
      rerender(ui(edited))
    })

    // Then the cell is drawing, and the agent is not told it has no data
    expect(screen.getAllByText("Drawing…").length).toBeGreaterThan(0)
    expect(getCell(edited).render_report?.problems).toEqual([])
  })
})

describe("DrawCanvas row-capped results", () => {
  const capped = (cell: NotebookCell): NotebookCell => {
    const result = cell.result!
    const [first] = result.results as Extract<
      CellResult["results"][number],
      { type: "dql" }
    >[]
    return {
      ...cell,
      result: { ...result, results: [{ ...first, count: 12000 }] },
    }
  }

  it("marks a chart drawn from part of its rows, and says how much", async () => {
    // Given a chart whose query returned 5 of 12,000 rows
    ;(globalThis as unknown as { __sql: string }).__sql = SQL
    const cell = capped(cellWith(dql(5)))
    renderComponent(ui(cell))

    // When the user hovers the warning in the chart's corner
    const badge = screen.getByRole("button", {
      name: /Drawn from part of the result/,
    })
    await userEvent.hover(badge)

    // Then it says which rows were drawn, and so does the agent's report
    const tooltip = await screen.findByRole("tooltip")
    expect(within(tooltip).getByText("First 5 of 12,000 rows.")).toBeVisible()
    expect(getCell(cell).render_report?.problems).toContainEqual({
      message:
        "Statement 1 returned only part of its rows; it is drawn from the rows returned.",
      severity: "warning",
    })
  })

  it("shows no mark on a complete result", () => {
    ;(globalThis as unknown as { __sql: string }).__sql = SQL
    renderComponent(ui(cellWith(dql(5))))
    expect(
      screen.queryByRole("button", { name: /Drawn from part of the result/ }),
    ).toBeNull()
  })

  it.each([
    ["stat", true],
    ["treemap", false],
  ] as const)(
    "marks a capped %s only when it draws part of the rows (%s)",
    (type, marked) => {
      // Given a component over a capped result
      ;(globalThis as unknown as { __sql: string }).__sql = SQL
      const cell = capped({
        ...cellWith(dql(5)),
        chartConfig: { xColumn: null, queries: [], visual: { type } },
      })
      renderComponent(ui(cell))

      // Then only a component that draws the rows it has carries the mark;
      // one that refuses them explains why in its pane
      expect(
        screen.queryByRole("button", { name: /Drawn from part of the result/ }),
      ).toEqual(marked ? expect.anything() : null)
    },
  )
})

describe("DrawCanvas click interactions", () => {
  it("writes a visual's click on a LONG column as a number", () => {
    // Given a gauge whose click sets a LONG id, which QuestDB sends as text
    ;(globalThis as unknown as { __sql: string }).__sql = SQL
    const setVariableValues = vi.spyOn(actions, "setVariableValues")
    const cell: NotebookCell = {
      ...cellWith({
        results: [
          {
            type: "dql",
            query: SQL,
            columns: [
              { name: "id", type: "LONG" },
              { name: "v", type: "DOUBLE" },
            ],
            dataset: [["42", 75]],
            count: 1,
            fetchedAt: 1,
          },
        ],
        activeResultIndex: 0,
        timestamp: 2,
      }),
      chartConfig: {
        xColumn: null,
        queries: [],
        visual: { type: "gauge", columns: { value: "v" } },
      },
      interactions: { click: { variable: "sel", column: "id" } },
    } as NotebookCell
    renderComponent(ui(cell))

    // When the user clicks the drawn item, which carries its row's id
    const events = (
      globalThis as unknown as {
        __visualEvents?: Record<string, (p: unknown, i: unknown) => void>
      }
    ).__visualEvents
    events?.click(
      { componentType: "series", data: { value: 75, columns: { id: "42" } } },
      {},
    )

    // Then the variable holds the number, typed by the result's column
    expect(setVariableValues).toHaveBeenCalledWith({ sel: "42" })
    setVariableValues.mockRestore()
  })
})
