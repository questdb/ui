// @vitest-environment jsdom
// A click that sets a new value re-runs the cells that read the variable,
// except a cell that declares the variable itself: its rows already match.
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
import { VariablesPopover } from "../../../src/scenes/Editor/Notebook/globals/VariablesPopover"
import { CellBottomContent } from "../../../src/scenes/Editor/Notebook/cells/CellBottomContent"
import { useCellRefresh } from "../../../src/scenes/Editor/Notebook/cellRefresh/CellRefreshContext"
import { useCellVirtualizationEngine } from "../../../src/scenes/Editor/Notebook/cellVirtualization/CellVirtualizationContext"
import { persistCellSnapshot } from "../../../src/scenes/Editor/Notebook/persistCellSnapshot"
import { expandGlobals } from "../../../src/scenes/Editor/Notebook/declareUtils"
import { echarts } from "../../../src/scenes/Editor/Notebook/CellChart/echartsSetup"

vi.mock("../../../src/providers/EditorProvider", () => ({
  useEditor: () => ({ updateBuffer: () => Promise.resolve() }),
}))
vi.mock("../../../src/modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))
vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => null,
  })
})

const noop = () => undefined
const initialVars = [{ name: "station", value: "'east'" }]
const sourceSql =
  "select 'east' as station, 4 as reading union all select 'west', 9 union all select 'north', 6"
let dependentSql = "select @station as station"
const stationCol = { name: "station", type: "STRING" }
const sourceColumns = [stationCol, { name: "reading", type: "INT" }]
const sourceData = [
  ["east", 4],
  ["west", 9],
  ["north", 6],
]
const initialFor = (): NotebookViewState => ({
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
})

const MountedCells = () => {
  const { cells, settings } = useNotebookState()
  const refresh = useCellRefresh()!
  const virtualization = useCellVirtualizationEngine()!
  const reveal = (ids: string[]) => () => {
    for (const id of ids) {
      refresh.setVisible(id, true)
      virtualization.reportMountBand(id, true, 0)
      virtualization.reportRetainBand(id, true)
    }
  }
  return (
    <>
      <Button onClick={reveal(["area", "dependent"])}>Reveal cells</Button>
      <Button onClick={reveal(["area"])}>Reveal chart</Button>
      <Button onClick={reveal(["dependent"])}>Reveal dependent</Button>
      <VariablesPopover />
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

const setup = async (bufferId: number, revealDependent = true) => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 700, 400),
  )
  for (const p of ["clientWidth", "offsetWidth"] as const)
    vi.spyOn(HTMLElement.prototype, p, "get").mockReturnValue(700)
  for (const p of ["clientHeight", "offsetHeight"] as const)
    vi.spyOn(HTMLElement.prototype, p, "get").mockReturnValue(400)
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
  let n = 0
  const abort = () => undefined
  const echoStation = (query: string) =>
    /@station := '(\w+)'(?![\s\S]*@station :=)/.exec(query)?.[1] ?? "?"
  const queryRaw = vi.fn((query: string, _options: unknown) => {
    const source = query.includes("as reading")
    return {
      queryId: `q-${++n}`,
      promise: Promise.resolve({
        type: Type.DQL,
        columns: source ? sourceColumns : [stationCol],
        dataset: source ? sourceData : [[echoStation(query)]],
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
    quest: { queryRaw, validateQuery, abort },
  } as unknown as React.ContextType<typeof QuestContext>
  const { container } = renderComponent(
    <QuestContext.Provider value={context}>
      <NotebookProvider bufferId={bufferId} initialState={initialFor()}>
        <MountedCells />
      </NotebookProvider>
    </QuestContext.Provider>,
  )
  fireEvent.click(
    screen.getByRole("button", {
      name: revealDependent ? "Reveal cells" : "Reveal chart",
    }),
  )
  const chart = await waitFor(() => {
    const host = container.querySelector<HTMLElement>("[_echarts_instance_]")
    expect(host).not.toBeNull()
    const chart = echarts.getInstanceByDom(host!)!
    expect(chart?.getOption()).toHaveProperty("series.0.data", [4, 9, 6])
    return chart
  })
  if (revealDependent)
    expect(await screen.findByRole("gridcell")).toHaveTextContent(/^east$/)
  const dependentCalls = () =>
    queryRaw.mock.calls.filter(([q]) => q.includes(dependentSql)).length
  const observation = () => ({
    binding: screen.getByTestId("binding").textContent,
    dependent: screen.queryByRole("gridcell")?.textContent ?? null,
    queries: dependentCalls(),
  })
  const settle = () =>
    act(() => new Promise((resolve) => setTimeout(resolve, 400)))
  const clickMark = (name: string, value: number) => {
    const canvas = chart.getDom().querySelector("canvas")!
    const [x, y] = chart.convertToPixel({ seriesIndex: 0 }, [name, value])
    const coordinates = { clientX: Math.round(x), clientY: Math.round(y) }
    const pointer = (ev: string) =>
      fireEvent(canvas, new MouseEvent(ev, { bubbles: true, ...coordinates }))
    act(() => {
      pointer("mousemove")
      chart.getZr().flush()
      pointer("mousedown")
      pointer("mouseup")
      pointer("click")
    })
  }
  return { observation, settle, clickMark }
}

it("does not re-run a cell that declares the clicked variable itself", async () => {
  // Given a dependent cell that declares its own @station
  dependentSql = "DECLARE @station := 'south' select @station as station"
  const { observation, settle, clickMark } = await setup(9921)

  // When the user clicks west, a new value
  clickMark("west", 9)
  await settle()

  // Then the binding changes but the cell, whose rows cannot change, does not run
  expect(observation()).toEqual({
    binding: "'west'",
    dependent: "east",
    queries: 0,
  })
})

it("re-runs a dependent cell whose stored result was not loaded yet", async () => {
  // Given a dependent cell kept off screen, its stored rows not loaded
  dependentSql = "select @station as station"
  const { observation, settle, clickMark } = await setup(9922, false)

  // When the user clicks west, then scrolls to the cell
  clickMark("west", 9)
  await settle()
  fireEvent.click(screen.getByRole("button", { name: "Reveal dependent" }))

  // Then the cell runs with the new value
  await waitFor(() =>
    expect(observation()).toEqual({
      binding: "'west'",
      dependent: "west",
      queries: 1,
    }),
  )
})
