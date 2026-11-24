// @vitest-environment jsdom
import React from "react"
import { Button } from "../../../src/components/Button"
import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { renderComponent } from "../../../src/test/component"
import { db } from "../../../src/store/db"
import type { NotebookViewState } from "../../../src/store/notebook"
import { Type } from "../../../src/utils/questdb/types"
import { QuestContext } from "../../../src/providers/QuestProvider"
import {
  NotebookProvider,
  useNotebookState,
} from "../../../src/scenes/Editor/Notebook/NotebookProvider"
import { CellBottomContent } from "../../../src/scenes/Editor/Notebook/cells/CellBottomContent"
import { useCellRefresh } from "../../../src/scenes/Editor/Notebook/cellRefresh/CellRefreshContext"
import { useCellVirtualizationEngine } from "../../../src/scenes/Editor/Notebook/cellVirtualization/CellVirtualizationContext"
import { persistCellSnapshot } from "../../../src/scenes/Editor/Notebook/persistCellSnapshot"
import { expandGlobals } from "../../../src/scenes/Editor/Notebook/declareUtils"
import { echarts } from "../../../src/scenes/Editor/Notebook/CellChart/echartsSetup"

// The values the chart's first series draws; each point also carries the
// rows it was drawn from, for clicks.
const drawnValues = (chart: { getOption(): unknown }) =>
  (
    (chart.getOption() as { series: { data: { value: unknown }[] }[] })
      .series[0]?.data ?? []
  ).map((point) => point.value)

vi.mock("../../../src/providers/EditorProvider", () => ({
  useEditor: () => ({ updateBuffer: () => Promise.resolve() }),
}))
vi.mock("../../../src/modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))
// The grid imports its optional measuring canvas before the test body.
vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => null,
  })
})

const noop = () => undefined
const bufferId = 906
const initialVars = [{ name: "station", value: "'east'" }]
const sourceSql =
  "select 'east' as station, 4 as reading union all select 'west', 9 union all select 'north', 6"
const dependentSql = "select @station as station"
const stationCol = { name: "station", type: "STRING" }
const sourceColumns = [stationCol, { name: "reading", type: "INT" }]
const sourceData = [
  ["east", 4],
  ["west", 9],
  ["north", 6],
]
const initial: NotebookViewState = {
  settings: { variables: initialVars, autoRefreshDefault: false },
  cells: [
    {
      id: "area",
      position: 0,
      value: sourceSql,
      mode: "draw",
      autoRefresh: false,
      chartConfig: {
        xColumn: "station",
        queries: [{ type: "area", yColumns: ["reading"] }],
      },
      interactions: { click: { variable: "station" } },
    },
    {
      id: "dependent",
      position: 1,
      value: dependentSql,
      autoRefresh: false,
      lastRunStatus: "success",
    },
  ],
}

const MountedCells = () => {
  const { cells, settings } = useNotebookState()
  const refresh = useCellRefresh()!
  const virtualization = useCellVirtualizationEngine()!
  const reveal = () => {
    // Simulate the near/far observer thresholds, not the chart point hit.
    for (const id of ["area", "dependent"]) {
      refresh.setVisible(id, true)
      virtualization.reportMountBand(id, true, 0)
      virtualization.reportRetainBand(id, true)
    }
  }
  return (
    <>
      <Button onClick={reveal}>Reveal cells</Button>
      <output data-testid="binding">{settings.variables?.[0]?.value}</output>
      {cells.map((cell) => (
        <CellBottomContent
          key={cell.id}
          cell={cell}
          contentMode="full"
          expectingResult
          isFocused
          isRunning={false}
          refreshIntervalMs={100}
          onSettingsChange={noop}
          onRetryUnmountWhileFocused={noop}
          onYieldFocus={noop}
        />
      ))}
    </>
  )
}

it("a pointer click on the Area preset selects the item name and refreshes the dependent grid", async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 700, 400),
  )
  for (const p of ["clientWidth", "offsetWidth"] as const)
    vi.spyOn(HTMLElement.prototype, p, "get").mockReturnValue(700)
  for (const p of ["clientHeight", "offsetHeight"] as const)
    vi.spyOn(HTMLElement.prototype, p, "get").mockReturnValue(400)
  // Only dimensions and drawing are supplied by the test; ECharts calculates
  // chart coordinates, creates hover shapes and processes real DOM input.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return new Proxy(
        {
          canvas: this,
          measureText: (text: string) => ({ width: text.length * 7 }),
          createLinearGradient: () => ({ addColorStop: noop }),
        },
        { get: (target, key): unknown => Reflect.get(target, key) ?? noop },
      ) as unknown as CanvasRenderingContext2D
    } as unknown as typeof HTMLCanvasElement.prototype.getContext,
  )
  await db.open()
  expect(
    await persistCellSnapshot({
      bufferId,
      cellId: "dependent",
      savedAt: Date.now(),
      results: [
        {
          type: "dql",
          query: dependentSql,
          effectiveQuery: expandGlobals(dependentSql, initialVars),
          columns: [stationCol],
          dataset: [["east"]],
          count: 1,
        },
      ],
    }),
  ).toBe(true)
  const targetQuery = expandGlobals(dependentSql, [
    { name: "station", value: "'west'" },
  ])
  let n = 0
  const queryRaw = vi.fn((query: string, _options: unknown) => {
    const source = query.includes("as reading")
    return {
      queryId: `q-${++n}`,
      promise: Promise.resolve({
        type: Type.DQL,
        columns: source ? sourceColumns : [stationCol],
        dataset: source
          ? sourceData
          : [[query === targetQuery ? "west" : "east"]],
        count: source ? sourceData.length : 1,
      }),
    }
  })
  const validateQuery = vi.fn((query: string) =>
    Promise.resolve({
      query,
      columns: query.includes("as reading") ? sourceColumns : [stationCol],
      timestamp: 0,
    }),
  )
  const context = {
    quest: { queryRaw, validateQuery, abort: noop },
  } as unknown as React.ContextType<typeof QuestContext>
  const { container } = renderComponent(
    <QuestContext.Provider value={context}>
      <NotebookProvider bufferId={bufferId} initialState={initial}>
        <MountedCells />
      </NotebookProvider>
    </QuestContext.Provider>,
  )
  fireEvent.click(screen.getByRole("button", { name: "Reveal cells" }))
  const chart = await waitFor(() => {
    const host = container.querySelector<HTMLElement>("[_echarts_instance_]")
    expect(host).not.toBeNull()
    const chart = echarts.getInstanceByDom(host!)!
    expect(drawnValues(chart)).toEqual([4, 9, 6])
    return chart
  })
  expect(await screen.findByRole("gridcell")).toHaveTextContent(/^east$/)
  const dependentCalls = () =>
    queryRaw.mock.calls.filter(([q]) => q.includes(dependentSql)).length
  expect(dependentCalls()).toBe(0)
  const clicks: unknown[] = []
  chart.on("click", (payload: unknown) => {
    clicks.push(payload)
  })
  const canvas = chart.getDom().querySelector("canvas")!
  expect(canvas).not.toBeNull()
  const [x, y] = chart.convertToPixel({ seriesIndex: 0 }, ["west", 9])
  expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
  const coordinates = { clientX: Math.round(x), clientY: Math.round(y) }
  const pointer = (name: string) =>
    fireEvent(canvas, new MouseEvent(name, { bubbles: true, ...coordinates }))
  act(() => {
    pointer("mousemove")
    chart.getZr().flush()
    pointer("mousedown")
    pointer("mouseup")
    pointer("click")
  })
  const observation = () => ({
    clicks: clicks.map((p) => (p as { name: unknown }).name),
    binding: screen.getByTestId("binding").textContent,
    dependent: screen.getByRole("gridcell").textContent,
    queries: dependentCalls(),
  })
  await waitFor(() =>
    expect(observation()).toEqual({
      clicks: ["west"],
      binding: "'west'",
      dependent: "west",
      queries: 1,
    }),
  )
  expect(queryRaw).toHaveBeenCalledWith(
    targetQuery,
    expect.objectContaining({ background: true }),
  )
})
