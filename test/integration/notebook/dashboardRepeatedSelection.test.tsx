// @vitest-environment jsdom
// A click that sets a variable to the value it already holds re-runs only the
// cells still showing rows for another value: after Apply in the Variables
// popover (which re-runs nothing) or a stopped re-query.
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

const setup = async (bufferId: number, hold?: (q: string) => boolean) => {
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
  const held = new Map<string, () => void>()
  const abort = (queryId?: string) => {
    if (queryId) held.get(queryId)?.()
  }
  const echoStation = (query: string) =>
    /@station := '(\w+)'/.exec(query)?.[1] ?? "?"
  const queryRaw = vi.fn((query: string, _options: unknown) => {
    const source = query.includes("as reading")
    if (!source && hold?.(query)) {
      const queryId = `q-${++n}`
      return {
        queryId,
        promise: new Promise((_resolve, reject) => {
          // Real client: an aborted fetch rejects with CANCELLED_BY_USER.
          held.set(queryId, () =>
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
  const observation = () => ({
    binding: screen.getByTestId("binding").textContent,
    dependent: screen.getByRole("gridcell").textContent,
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

it("re-runs a cell left on another value when its stored value is clicked", async () => {
  // Given the user applied west in the Variables popover, which re-runs
  // nothing, so the dependent cell still shows east
  const { observation, settle, clickMark } = await setup(9902)
  fireEvent.click(screen.getByRole("button", { name: "Variables (1)" }))
  const input = (await screen.findAllByPlaceholderText(/^value/))[0]
  fireEvent.change(input, { target: { value: "'west'" } })
  fireEvent.click(screen.getByRole("button", { name: "Apply" }))
  await settle()
  expect(observation()).toEqual({
    binding: "'west'",
    dependent: "east",
    queries: 0,
  })

  // When the user clicks the west mark, the value already stored
  clickMark("west", 9)

  // Then the dependent cell shows west
  await waitFor(() =>
    expect(observation()).toEqual({
      binding: "'west'",
      dependent: "west",
      queries: 1,
    }),
  )
})

it("re-runs a stopped selection when its value is clicked again", async () => {
  // Given the user clicked west and stopped the dependent cell's re-query
  let held = 0
  const { observation, settle, clickMark } = await setup(
    9903,
    (q) => q.includes("@station := 'west'") && held++ === 0,
  )
  clickMark("west", 9)
  const refreshing = await screen.findByText("Refreshing...")
  fireEvent.click(refreshing.parentElement!.querySelector("button")!)
  await settle()
  expect(observation()).toEqual({
    binding: "'west'",
    dependent: "east",
    queries: 1,
  })

  // When the user clicks west again
  clickMark("west", 9)

  // Then the cell runs again and shows west
  await waitFor(() =>
    expect(observation()).toEqual({
      binding: "'west'",
      dependent: "west",
      queries: 2,
    }),
  )
})

it("keeps a running re-query when its value is clicked again", async () => {
  // Given the user clicked west and the dependent cell is fetching
  const { observation, settle, clickMark } = await setup(9904, (q) =>
    q.includes("@station := 'west'"),
  )
  clickMark("west", 9)
  await screen.findByText("Refreshing...")

  // When the user clicks west again
  clickMark("west", 9)
  await settle()

  // Then the running fetch is not restarted
  expect(observation().queries).toBe(1)
  expect(screen.getByText("Refreshing...")).toBeInTheDocument()
})

it("does not re-run a cell already showing the clicked value", async () => {
  // Given the dependent cell re-ran for west after a click
  const { observation, clickMark } = await setup(9905)
  clickMark("west", 9)
  await waitFor(() => expect(observation().dependent).toBe("west"))

  // When the user clicks west again
  clickMark("west", 9)
  await act(() => new Promise((resolve) => setTimeout(resolve, 400)))

  // Then its rows already match, and nothing runs
  expect(observation()).toEqual({
    binding: "'west'",
    dependent: "west",
    queries: 1,
  })
})
