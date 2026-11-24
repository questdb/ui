import { chartSyncOf } from "../interactions/chartSync"
import {
  DEFAULT_ZOOM,
  LINKED_AXIS,
  isZoomedState,
  zoomStateFits,
  type AxisKey,
  type ZoomAxes,
  type ZoomState,
} from "../CellChart/zoomWindow"

// The zoom of every chart, per control, and the only place it is kept. A
// chart draws the windows it finds here and writes the user's gestures here;
// chartZoomBinding applies changes to the charts that are mounted, and a
// chart that mounts later draws from here, so a chart scrolled away or hidden
// by Maximize does not miss a zoom.
//
// A notebook with "Zoom time charts together" also holds one linked window:
// the first x axis of its time charts shows it, unless the chart was zoomed
// or reset on its own after it was set.

export type ZoomScope = { bufferId: number; cellId: string }

type Stamped = { state: ZoomState; seq: number }

type CellZoom = {
  own: Map<AxisKey, Stamped>
  // The axes of the option last drawn, kept after the chart unmounts.
  axes?: ZoomAxes
  // Series the user hid in the legend.
  legend?: Record<string, boolean>
  // Where the user panned and zoomed a roaming map or graph, by component
  // ("series.0", "geo.0").
  roam?: ChartRoam
  // Bumped when the roam is reset, so the chart redraws without it.
  roamReset: number
}

export type ChartRoam = Record<string, { center?: unknown; zoom?: unknown }>

const cells = new Map<string, CellZoom>()
const linked = new Map<number, Stamped>()
const listeners = new Map<string, Set<() => void>>()
let seq = 0

const SEP = "\u0000"
const keyOf = ({ bufferId, cellId }: ZoomScope) => `${bufferId}${SEP}${cellId}`
const inBuffer = (key: string, bufferId: number) =>
  key.startsWith(`${bufferId}${SEP}`)

const cellOf = (scope: ZoomScope): CellZoom => {
  const key = keyOf(scope)
  let cell = cells.get(key)
  if (!cell) {
    cell = { own: new Map(), roamReset: 0 }
    cells.set(key, cell)
  }
  return cell
}

const notify = (key: string) => {
  listeners.get(key)?.forEach((listener) => listener())
}

const notifyBuffer = (bufferId: number) => {
  for (const key of [...listeners.keys()])
    if (inBuffer(key, bufferId)) notify(key)
}

// The stamp that decides a control's state: its own, or the linked window
// when that is newer and the chart is a time chart.
const winning = (
  scope: ZoomScope,
  key: AxisKey,
  axes: ZoomAxes | undefined,
): { stamp?: Stamped; linked: boolean } => {
  const own = cells.get(keyOf(scope))?.own.get(key)
  const link =
    key === LINKED_AXIS && axes?.time ? linked.get(scope.bufferId) : undefined
  return link && (!own || link.seq > own.seq)
    ? { stamp: link, linked: true }
    : { stamp: own, linked: false }
}

/**
 * The zoom state of a chart's control. `axes` describes the option being
 * drawn; without it, the one drawn last.
 */
export const chartZoomState = (
  scope: ZoomScope,
  key: AxisKey,
  axes: ZoomAxes | undefined = cells.get(keyOf(scope))?.axes,
): ZoomState => {
  const state = winning(scope, key, axes).stamp?.state ?? DEFAULT_ZOOM
  return zoomStateFits(state, axes?.axes[key]) ? state : DEFAULT_ZOOM
}

const keysOf = (scope: ZoomScope): AxisKey[] => {
  const cell = cells.get(keyOf(scope))
  const keys = new Set([
    ...(cell?.own.keys() ?? []),
    ...Object.keys(cell?.axes?.axes ?? {}),
  ])
  if (cell?.axes?.time) keys.add(LINKED_AXIS)
  return [...keys]
}

/** Whether any control of the chart shows less than its option's window. */
export const chartZoomed = (scope: ZoomScope): boolean =>
  cells.get(keyOf(scope))?.roam !== undefined ||
  keysOf(scope).some((key) => isZoomedState(chartZoomState(scope, key)))

/** A gesture's window on one control of this chart only. */
export const setChartZoom = (
  scope: ZoomScope,
  key: AxisKey,
  state: ZoomState,
) => {
  cellOf(scope).own.set(key, { state, seq: ++seq })
  notify(keyOf(scope))
}

/** A gesture's window on a linked time chart: every time chart's x axis. */
export const setLinkedZoom = (bufferId: number, state: ZoomState) => {
  linked.set(bufferId, { state, seq: ++seq })
  notifyBuffer(bufferId)
}

/**
 * Puts every control of the chart back on its option's window. Reset zoom
 * also resets the linked window when the chart is a linked time chart; an
 * SQL edit (`localOnly`) resets the edited chart alone.
 */
export const resetChartZoom = (
  scope: ZoomScope,
  { localOnly = false }: { localOnly?: boolean } = {},
) => {
  const keys = keysOf(scope)
  const cell = cells.get(keyOf(scope))
  const roamed = clearRoam(cell)
  if (keys.length === 0 || !cell) {
    if (roamed) notify(keyOf(scope))
    return
  }
  for (const key of keys) cell.own.set(key, { state: DEFAULT_ZOOM, seq: ++seq })
  if (!localOnly && cell.axes?.time && chartSyncOf(scope.bufferId)?.zoom)
    setLinkedZoom(scope.bufferId, DEFAULT_ZOOM)
  else notify(keyOf(scope))
}

/**
 * Resets the windows this chart holds on its own (not a linked window), for
 * a chart left without any control that could move them back.
 */
export const resetOwnChartZoom = (scope: ZoomScope) => {
  const cell = cells.get(keyOf(scope))
  if (!cell) return
  const roamed = clearRoam(cell)
  const own = keysOf(scope).filter((key) => {
    const { stamp, linked: fromLink } = winning(scope, key, cell.axes)
    return !fromLink && stamp !== undefined && isZoomedState(stamp.state)
  })
  if (own.length === 0) {
    if (roamed) notify(keyOf(scope))
    return
  }
  for (const key of own) cell.own.set(key, { state: DEFAULT_ZOOM, seq: ++seq })
  notify(keyOf(scope))
}

/** Records the axes of the option a chart drew. */
export const setChartZoomAxes = (scope: ZoomScope, axes: ZoomAxes) => {
  const cell = cellOf(scope)
  if (JSON.stringify(cell.axes) === JSON.stringify(axes)) return
  cell.axes = axes
  notify(keyOf(scope))
}

export const chartLegendSelected = (
  scope: ZoomScope,
): Record<string, boolean> | undefined => cells.get(keyOf(scope))?.legend

export const setChartLegendSelected = (
  scope: ZoomScope,
  selected: Record<string, boolean>,
) => {
  cellOf(scope).legend = { ...selected }
}

/** Where the user panned and zoomed the chart's roaming maps and graphs. */
export const chartRoam = (scope: ZoomScope): ChartRoam | undefined =>
  cells.get(keyOf(scope))?.roam

/** A count that changes when the chart's roam is reset. */
export const chartRoamResets = (scope: ZoomScope): number =>
  cells.get(keyOf(scope))?.roamReset ?? 0

/** A pan or zoom of a roaming map or graph, so a redraw keeps it. */
export const setChartRoam = (scope: ZoomScope, roam: ChartRoam) => {
  const cell = cellOf(scope)
  const wasRoamed = cell.roam !== undefined
  cell.roam = roam
  // The toolbar's Reset shows once the chart is moved.
  if (!wasRoamed) notify(keyOf(scope))
}

const clearRoam = (cell: CellZoom | undefined): boolean => {
  if (!cell?.roam) return false
  cell.roam = undefined
  cell.roamReset++
  return true
}

/** Forgets a deleted cell's chart. */
export const clearChartZoom = (scope: ZoomScope) => {
  if (!cells.delete(keyOf(scope))) return
  notify(keyOf(scope))
}

/** Forgets every chart of a closed notebook, and its linked window. */
export const clearNotebookChartZooms = (bufferId: number) => {
  linked.delete(bufferId)
  for (const key of [...cells.keys()])
    if (inBuffer(key, bufferId)) cells.delete(key)
  notifyBuffer(bufferId)
}

export const subscribeChartZoom = (
  scope: ZoomScope,
  listener: () => void,
): (() => void) => {
  const key = keyOf(scope)
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(listener)
  return () => {
    const current = listeners.get(key)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) listeners.delete(key)
  }
}
