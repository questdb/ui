// @vitest-environment jsdom
// A click back to the value a dependent cell already shows, while its read
// for another value is still running: the cell ends on the selected value.
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
    for (const id of ["area", "dependent"]) {
      refresh.setVisible(id, true)
      virtualization.reportMountBand(id, true, 0)
      virtualization.reportRetainBand(id, true)
    }
  }
  return (
    <>
      <Button onClick={reveal}>Reveal cells</Button>
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

const setup = async (bufferId: number) => {
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
  // Reads for west wait until the test lets them answer; an abort answers
  // them with the client's cancellation error.
  const held: Array<() => void> = []
  const aborts = new Map<string, () => void>()
  const echoStation = (query: string) =>
    /@station := '(\w+)'/.exec(query)?.[1] ?? "?"
  const queryRaw = vi.fn((query: string, _options: unknown) => {
    const source = query.includes("as reading")
    const queryId = `q-${++n}`
    const answer = {
      type: Type.DQL,
      columns: source ? sourceColumns : [stationCol],
      dataset: source ? sourceData : [[echoStation(query)]],
      count: source ? sourceData.length : 1,
    }
    if (!source && query.includes("@station := 'west'")) {
      return {
        queryId,
        promise: new Promise((resolve, reject) => {
          held.push(() => resolve(answer))
          aborts.set(queryId, () =>
            reject({
              position: -1,
              query,
              type: Type.ERROR,
              error: "Cancelled by user",
            }),
          )
        }),
      }
    }
    return { queryId, promise: Promise.resolve(answer) }
  })
  const validateQuery = vi.fn((query: string) =>
    Promise.resolve({
      query,
      columns: query.includes("as reading") ? sourceColumns : [stationCol],
      timestamp: 0,
    }),
  )
  const abort = (queryId?: string) => {
    if (queryId) aborts.get(queryId)?.()
  }
  const context = {
    quest: { queryRaw, validateQuery, abort },
  } as unknown as React.ContextType<typeof QuestContext>
  const { container } = renderComponent(
    <QuestContext.Provider value={context}>
      <NotebookProvider bufferId={bufferId} initialState={initial}>
        <MountedCells />
      </NotebookProvider>
    </QuestContext.Provider>,
  )
  fireEvent.click(screen.getByRole("button", { name: "Reveal cells" }))
  await waitFor(() => {
    const host = container.querySelector<HTMLElement>("[_echarts_instance_]")
    expect(host).not.toBeNull()
    const chart = echarts.getInstanceByDom(host!)!
    expect(drawnValues(chart)).toEqual([4, 9, 6])
  })
  expect(await screen.findByRole("gridcell")).toHaveTextContent(/^east$/)
  const observation = () => ({
    binding: screen.getByTestId("binding").textContent,
    dependent: screen.getByRole("gridcell").textContent,
  })
  const clickMark = async (name: string, value: number) => {
    const { live, x, y } = await waitFor(() => {
      const host = container.querySelector<HTMLElement>("[_echarts_instance_]")
      const live = host ? echarts.getInstanceByDom(host) : undefined
      const at = live?.convertToPixel({ seriesIndex: 0 }, [name, value])
      expect(at?.every(Number.isFinite)).toBe(true)
      return { live: live!, x: at![0], y: at![1] }
    })
    const canvas = live.getDom().querySelector("canvas")!
    const coordinates = { clientX: Math.round(x), clientY: Math.round(y) }
    const pointer = (ev: string) =>
      fireEvent(canvas, new MouseEvent(ev, { bubbles: true, ...coordinates }))
    act(() => {
      pointer("mousemove")
      live.getZr().flush()
      pointer("mousedown")
      pointer("mouseup")
      pointer("click")
    })
  }
  const releaseHeld = () => act(() => held.splice(0).forEach((go) => go()))
  return { observation, clickMark, releaseHeld }
}

it("shows the clicked value when it returns to the rows on screen while another read runs", async () => {
  // Given the dependent cell is reading west after a click on west
  const { observation, clickMark, releaseHeld } = await setup(9951)
  await clickMark("west", 9)
  await screen.findByText("Refreshing...")

  // When the user clicks east, the value its rows were read with, and the
  // west read answers afterwards
  await clickMark("east", 4)
  await waitFor(() => expect(observation().binding).toBe("'east'"))
  releaseHeld()
  await act(() => new Promise((resolve) => setTimeout(resolve, 400)))

  // Then the cell shows east, the selected value
  expect(observation()).toEqual({ binding: "'east'", dependent: "east" })
})
