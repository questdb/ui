// @vitest-environment jsdom
import React from "react"
import { act } from "@testing-library/react"
import type { EChartsType } from "echarts"
import { ThemeProvider } from "styled-components"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import { darkTheme, lightTheme } from "../../../../theme"
import type { ChartSync, NotebookCell } from "../../../../store/notebook"
import { echarts } from "../CellChart/echartsSetup"
import { primaryXControls } from "../CellChart/liveZoom"
import {
  clearChartZoom,
  resetChartZoom,
} from "../cellVirtualization/chartZoomStore"
import {
  instanceIn,
  resultOf,
  sleep,
  stubChartLayout,
  type Statement,
} from "../DrawCanvas/chartTestHarness"
import { DrawCanvas } from "../DrawCanvas/index"

// Pattern guard for the zoom window: random sequences of what users and the
// notebook do to linked and unlinked time charts and a custom chart (zoom,
// reset, refreshes, theme, remounts, peers mounting and unmounting, linking,
// Maximize/Restore), checked after every step against a model of the zoom
// each chart's control should hold:
//
//   default     the option's own window (an authored custom window, else all)
//   full        the whole data, following new data
//   pinned      a time window, kept on its times while the data moves
//
// A zoom of a linked time chart sets the notebook's linked window, which every
// time chart shows unless it was zoomed or reset on its own since.

const notebook: { chartSync?: ChartSync } = {}

vi.mock("../NotebookProvider", () => ({
  useNotebookBufferId: () => 977,
  useNotebookSettings: () => notebook,
  useNotebookActions: () => ({
    setVariableValues: () => undefined,
    updateSettings: () => undefined,
    getVariables: () => [],
  }),
}))
vi.mock("../../../../modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))

const MIN = 60_000
const T0 = Date.UTC(2026, 0, 1)
// Enough points for the preset chart to show its slider and wheel zoom.
const ROWS = 720

type CellId = "t1" | "t2" | "t3" | "custom"
const CELL_IDS: CellId[] = ["t1", "t2", "t3", "custom"]
// The custom option opens on the last half of its data.
const AUTHORED = { start: 50, end: 100 }

type ZoomState =
  | { mode: "default" }
  | { mode: "full" }
  | { mode: "pinned"; from: number; to: number }
type Stamped = { state: ZoomState; at: number }

type World = {
  rows: Record<CellId, { from: number; to: number }>
  mounted: Record<CellId, boolean>
  generation: Record<CellId, number>
  maximized?: CellId
  dark: boolean
  linked: boolean
  // The model.
  own: Record<CellId, Stamped>
  linkedZoom?: Stamped
  clock: number
}

const effective = (world: World, id: CellId): ZoomState => {
  const own = world.own[id]
  const linked = world.linkedZoom
  return linked && linked.at > own.at ? linked.state : own.state
}

// ------------------------------------------------------------------------
// The app under test: DrawCanvas cells in a notebook.

const statementOf = (id: CellId, world: World): Statement => {
  const { from, to } = world.rows[id]
  return {
    query: `select ts, v from m_${id}`,
    columns: [
      { name: "ts", type: "TIMESTAMP" },
      { name: "v", type: "DOUBLE" },
    ],
    rows: Array.from({ length: to - from + 1 }, (_, i) => [
      new Date(T0 + (from + i) * MIN).toISOString(),
      ((from + i) * 7) % 31,
    ]),
  }
}

const cellOf = (id: CellId, world: World): NotebookCell => {
  const statement = statementOf(id, world)
  return {
    id,
    position: CELL_IDS.indexOf(id),
    value: statement.query,
    mode: "draw",
    result: resultOf([statement], world.rows[id].to),
    ...(id === "custom"
      ? {
          chartConfig: {
            xColumn: null,
            queries: [],
            custom: {
              option: {
                xAxis: { type: "time" },
                yAxis: { type: "value" },
                series: [
                  {
                    type: "line",
                    datasetId: "q0",
                    encode: { x: "ts", y: "v" },
                  },
                ],
                dataZoom: [{ type: "inside", ...AUTHORED }],
              },
            },
          },
        }
      : {}),
  }
}

const noop = () => undefined

const App = ({ world }: { world: World }) => {
  notebook.chartSync = world.linked
    ? { crosshair: "off", zoom: true }
    : undefined
  const shown = world.maximized
    ? [world.maximized]
    : CELL_IDS.filter((id) => world.mounted[id])
  return (
    <ThemeProvider theme={world.dark ? darkTheme : lightTheme}>
      <div data-hook={world.maximized ? "maximized" : "list"}>
        {shown.map((id) => (
          <div key={`${id}:${world.generation[id]}`} data-hook={id}>
            <DrawCanvas
              cell={cellOf(id, world)}
              isFocused={false}
              refreshIntervalMs={100}
              onSettingsChange={noop}
              onRetryUnmountWhileFocused={noop}
            />
          </div>
        ))}
      </div>
    </ThemeProvider>
  )
}

// ------------------------------------------------------------------------
// Reading what a chart shows, and what it should show.

const shownIds = (world: World): CellId[] =>
  world.maximized
    ? [world.maximized]
    : CELL_IDS.filter((id) => world.mounted[id])

const chartOf = (root: ParentNode, id: CellId): EChartsType | undefined => {
  const host = root.querySelector(`[data-hook="${id}"]`)
  return host ? instanceIn(host) : undefined
}

const shownWindow = (instance: EChartsType) => {
  try {
    return primaryXControls(instance)[0]?.getValueRange("x", 0)
  } catch {
    // A lazy update not processed yet.
    return undefined
  }
}

const drawnRows = (instance: EChartsType): number | undefined => {
  try {
    const model = (
      instance as unknown as {
        getModel(): {
          getSeriesByIndex(i: number): { getRawData(): { count(): number } }
        }
      }
    ).getModel()
    return model.getSeriesByIndex(0)?.getRawData().count()
  } catch {
    return undefined
  }
}

// A fresh chart of the cell's current data given the window the model holds.
const expectedWindow = (world: World, id: CellId) => {
  const state = effective(world, id)
  const { from, to } = world.rows[id]
  const window =
    state.mode === "pinned"
      ? { startValue: state.from, endValue: state.to }
      : state.mode === "full" || id !== "custom"
        ? { start: 0, end: 100 }
        : AUTHORED
  const reference = echarts.init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 700,
    height: 400,
  })
  reference.setOption(
    {
      animation: false,
      xAxis: { type: "time" },
      yAxis: { type: "value" },
      dataZoom: [{ type: "inside", ...window }],
      series: [
        {
          type: "line",
          data: [
            [T0 + from * MIN, 0],
            [T0 + to * MIN, 0],
          ],
        },
      ],
    },
    { notMerge: true },
  )
  const shown = shownWindow(reference)
  reference.dispose()
  return shown
}

// ------------------------------------------------------------------------
// Steps.

type Step =
  | { kind: "zoom"; id: CellId; start: number; end: number }
  | { kind: "reset"; id: CellId }
  | { kind: "localReset"; id: CellId }
  | { kind: "refresh"; id: CellId; grow: number; slide: number }
  | { kind: "theme" }
  | { kind: "unmount"; id: CellId }
  | { kind: "mount"; id: CellId }
  | { kind: "remount"; id: CellId }
  | { kind: "link" }
  | { kind: "maximize"; id: CellId }
  | { kind: "restore" }

const mulberry32 = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const nextStep = (random: () => number, world: World): Step => {
  const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)]
  const shown = shownIds(world)
  const anyId = pick(CELL_IDS)
  const roll = random()
  if (world.maximized && roll < 0.15) return { kind: "restore" }
  if (roll < 0.3 && shown.length > 0) {
    const full = random() < 0.15
    const start = full ? 0 : Math.floor(random() * 60)
    const end = full ? 100 : start + 10 + Math.floor(random() * (90 - start))
    return { kind: "zoom", id: pick(shown), start, end }
  }
  if (roll < 0.38) return { kind: "reset", id: anyId }
  if (roll < 0.42) return { kind: "localReset", id: anyId }
  if (roll < 0.58)
    return {
      kind: "refresh",
      id: anyId,
      grow: 5 + Math.floor(random() * 60),
      slide: random() < 0.5 ? 0 : 5 + Math.floor(random() * 60),
    }
  if (roll < 0.63) return { kind: "theme" }
  if (roll < 0.73)
    return world.mounted[anyId]
      ? { kind: "unmount", id: anyId }
      : { kind: "mount", id: anyId }
  if (roll < 0.8) return { kind: "remount", id: anyId }
  if (roll < 0.88) return { kind: "link" }
  if (!world.maximized) return { kind: "maximize", id: anyId }
  return { kind: "restore" }
}

const describeStep = (step: Step) =>
  Object.entries(step)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ")

// ------------------------------------------------------------------------

const settle = async (root: ParentNode, world: World) => {
  let ready = 0
  for (let i = 0; i < 200 && ready < 2; i++) {
    await act(() => sleep(10))
    const ok = shownIds(world).every((id) => {
      const instance = chartOf(root, id)
      const rows = world.rows[id]
      return (
        instance !== undefined &&
        shownWindow(instance) !== undefined &&
        drawnRows(instance) === rows.to - rows.from + 1
      )
    })
    ready = ok ? ready + 1 : 0
  }
}

const stamp = (world: World, state: ZoomState): Stamped => ({
  state,
  at: ++world.clock,
})

const apply = (root: ParentNode, world: World, step: Step): World => {
  const next: World = {
    ...world,
    rows: { ...world.rows },
    mounted: { ...world.mounted },
    generation: { ...world.generation },
    own: { ...world.own },
  }
  switch (step.kind) {
    case "zoom": {
      const instance = chartOf(root, step.id)
      const control = instance && primaryXControls(instance)[0]
      if (!instance || !control) return world
      // A slider drag or a wheel turn on the chart's time control.
      act(() => {
        instance.dispatchAction({
          type: "dataZoom",
          dataZoomId: control.id,
          start: step.start,
          end: step.end,
        })
      })
      const window = primaryXControls(instance)[0]?.getValueRange("x", 0)
      if (!window) return world
      const state: ZoomState =
        step.start <= 0 && step.end >= 100
          ? { mode: "full" }
          : { mode: "pinned", from: window[0], to: window[1] }
      if (next.linked) next.linkedZoom = stamp(next, state)
      else next.own[step.id] = stamp(next, state)
      return next
    }
    case "reset":
      act(() => resetZoom(step.id, false))
      next.own[step.id] = stamp(next, { mode: "default" })
      if (next.linked) next.linkedZoom = stamp(next, { mode: "default" })
      return next
    case "localReset":
      act(() => resetZoom(step.id, true))
      next.own[step.id] = stamp(next, { mode: "default" })
      return next
    case "refresh": {
      const rows = next.rows[step.id]
      next.rows[step.id] = {
        from: rows.from + step.slide,
        to: rows.to + step.grow + step.slide,
      }
      return next
    }
    case "theme":
      next.dark = !next.dark
      return next
    case "unmount":
      next.mounted[step.id] = false
      return next
    case "mount":
      next.mounted[step.id] = true
      return next
    case "remount":
      next.generation[step.id] += 1
      return next
    case "link":
      next.linked = !next.linked
      return next
    case "maximize":
      next.maximized = step.id
      return next
    case "restore":
      next.maximized = undefined
      return next
  }
}

// What the toolbar's Reset zoom and an SQL edit do to a cell's zoom.
const resetZoom = (id: CellId, localOnly: boolean) =>
  resetChartZoom(id, localOnly)

const checkInvariant = (root: ParentNode, world: World, trail: string[]) => {
  const ids = shownIds(world)
  for (const id of ids) {
    const instance = chartOf(root, id)
    const shown = instance && shownWindow(instance)
    const expected = expectedWindow(world, id)
    const where = `[${ids.join(",")}] ${id} (${JSON.stringify(effective(world, id))}) after\n  ${trail.join("\n  ")}`
    expect(shown, where).toBeDefined()
    expect(expected, where).toBeDefined()
    const span = world.rows[id].to - world.rows[id].from
    const tolerance = Math.max(1, span * MIN * 1e-9)
    expect(
      Math.abs(shown![0] - expected![0]) <= tolerance &&
        Math.abs(shown![1] - expected![1]) <= tolerance,
      `${where}\n  shows ${shown!.map((v) => new Date(v).toISOString()).join("..")}, expected ${expected!.map((v) => new Date(v).toISOString()).join("..")}`,
    ).toBe(true)
  }
  // Linked charts that hold the same times and have them in their data
  // show the same times.
  const linked = world.linkedZoom?.state
  if (linked?.mode === "pinned") {
    const sharing = ids.filter((id) => {
      const rows = world.rows[id]
      return (
        effective(world, id) === linked &&
        T0 + rows.from * MIN <= linked.from &&
        T0 + rows.to * MIN >= linked.to
      )
    })
    const windows = sharing.map((id) => shownWindow(chartOf(root, id)!))
    for (const window of windows)
      expect(window, `linked charts agree after ${trail.join(", ")}`).toEqual(
        windows[0],
      )
  }
}

const run = async (seed: number, steps: number) => {
  stubChartLayout()
  const random = mulberry32(seed)
  let world: World = {
    rows: {
      t1: { from: 0, to: ROWS - 1 },
      t2: { from: 0, to: ROWS - 1 },
      t3: { from: 30, to: ROWS + 29 },
      custom: { from: 0, to: ROWS - 1 },
    },
    mounted: { t1: true, t2: true, t3: true, custom: true },
    generation: { t1: 0, t2: 0, t3: 0, custom: 0 },
    dark: true,
    linked: random() < 0.5,
    own: {
      t1: { state: { mode: "default" }, at: 0 },
      t2: { state: { mode: "default" }, at: 0 },
      t3: { state: { mode: "default" }, at: 0 },
      custom: { state: { mode: "default" }, at: 0 },
    },
    clock: 0,
  }
  const { container, rerender, unmount } = renderComponent(
    <App world={world} />,
  )
  const trail: string[] = [`linked=${world.linked}`]
  try {
    await settle(container, world)
    checkInvariant(container, world, trail)
    for (let i = 0; i < steps; i++) {
      const step = nextStep(random, world)
      trail.push(describeStep(step))
      world = apply(container, world, step)
      rerender(<App world={world} />)
      await settle(container, world)
      checkInvariant(container, world, trail)
    }
  } finally {
    unmount()
    for (const id of CELL_IDS) clearChartZoom(id)
  }
}

afterEach(() => {
  notebook.chartSync = undefined
})

const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1)
// Seeds whose sequences today's code fails (see the commit message).
const FAILING_TODAY = new Set<number>([
  1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16,
])

describe("every chart shows its zoom state's window on its current data", () => {
  for (const seed of SEEDS) {
    const test = FAILING_TODAY.has(seed) ? it.fails : it
    test(`seed ${seed}`, () => run(seed, 30), 60_000)
  }
})
