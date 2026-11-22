// @vitest-environment jsdom
// A click that repeats a variable's value while a cell's round runs: a
// statement the user stopped in that round runs again once it ends.
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
const sqlA = "select @station as station"
const sqlB = "select @station as other"
const dependentSql = `${sqlA};\n${sqlB}`
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
      results: [sqlA, sqlB].map((q) => ({
        type: "dql" as const,
        query: q,
        effectiveQuery: expandGlobals(q, initialVars),
        columns: [stationCol],
        dataset: [["east"]],
        count: 1,
      })),
    }),
  ).toBe(true)
  let n = 0
  const held = new Map<string, () => void>()
  const release = new Map<string, () => void>()
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
        promise: new Promise((resolve, reject) => {
          release.set(query, () =>
            resolve({
              type: Type.DQL,
              columns: [stationCol],
              dataset: [[echoStation(query)]],
              count: 1,
            }),
          )
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
    expect(chart?.getOption()).toHaveProperty("series.0.data", [4, 9, 6])
    return chart
  })
  expect(await screen.findByRole("gridcell")).toHaveTextContent(/^east$/)
  const dependentCalls = () =>
    queryRaw.mock.calls.filter(([q]) => q.includes(sqlA)).length
  const observation = () => ({
    binding: screen.getByTestId("binding").textContent,
    dependent: screen.getByRole("gridcell").textContent,
    queriesA: dependentCalls(),
    queriesB: queryRaw.mock.calls.filter(([q]) => q.includes(sqlB)).length,
    log: queryRaw.mock.calls
      .map(([q]) => q)
      .filter((q) => !q.includes("as reading")),
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
  return { observation, settle, clickMark, release, queryRaw }
}

it("re-runs a stopped statement after the round when its value is clicked again", async () => {
  // Given a two-statement cell refreshing after a click on west, with the
  // user stopping its first statement while the second still runs
  let heldA = 0
  const { observation, settle, clickMark, release } = await setup(
    9933,
    (q) =>
      q.includes("@station := 'west'") &&
      ((q.includes(sqlA) && heldA++ === 0) || q.includes(sqlB)),
  )
  clickMark("west", 9)
  const refreshing = await screen.findByText("Refreshing...")
  fireEvent.click(refreshing.parentElement!.querySelector("button")!)
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
  const stopped = observation()

  // When the user clicks west again while the second statement runs
  clickMark("west", 9)
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)))

  // Then the running round is kept
  expect(observation().queriesA).toBe(stopped.queriesA)

  // And once it ends, the stopped statement runs again and shows west
  const second = [...release.keys()].find((q) => q.includes(sqlB))!
  act(() => release.get(second)!())
  await settle()
  await waitFor(() => expect(observation().dependent).toBe("west"))
  expect(observation().queriesA).toBe(stopped.queriesA + 1)
})
