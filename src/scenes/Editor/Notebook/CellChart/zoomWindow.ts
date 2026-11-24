import type { EChartsOption } from "echarts"
import type { ZoomControl } from "./liveZoom"

// A chart's zoom is held per dataZoom control, and a control is known by the
// axis it moves: "x0" is x axis 0, "y1" y axis 1, "single0" single axis 0.
// The same key comes from an option (before ECharts reads it) and from a live
// control, so a window survives a redraw that rebuilds the controls.

export type AxisKey = string

/** The axis a linked time zoom moves: a time chart's first x axis. */
export const LINKED_AXIS: AxisKey = "x0"

export type AxisType = "time" | "value" | "log" | "category"

export type ZoomState =
  /** The option's own window: an authored start/end, else all the data. */
  | { mode: "default" }
  /** All the data, following new data. */
  | { mode: "full" }
  /** A window in axis units, kept on its values while the data moves. */
  | {
      mode: "pinned"
      from: number
      to: number
      axis: Exclude<AxisType, "category">
    }
  /** A share of a category axis, where values mean nothing across data. */
  | { mode: "pinned-pct"; start: number; end: number }

export const DEFAULT_ZOOM: ZoomState = { mode: "default" }

/** The axes a drawn option's zoom controls move, for reading its states. */
export type ZoomAxes = {
  /** The first x axis is a time axis: the chart takes linked time zooms. */
  time: boolean
  axes: Record<AxisKey, AxisType>
}

export const sameZoomState = (a: ZoomState, b: ZoomState): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

/** A pinned window applies only on the kind of axis it was taken on. */
export const zoomStateFits = (
  state: ZoomState,
  axis: AxisType | undefined,
): boolean => {
  if (axis === undefined) return true
  if (state.mode === "pinned") return state.axis === axis
  if (state.mode === "pinned-pct") return axis === "category"
  return true
}

export const isZoomedState = (state: ZoomState): boolean =>
  state.mode === "pinned" || state.mode === "pinned-pct"

type Part = Record<string, unknown>

const DIMS = ["x", "y", "radius", "angle", "single"] as const
type Dim = (typeof DIMS)[number]

const listOf = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value == null ? [] : [value]

const partsOf = (value: unknown): Part[] =>
  listOf(value).map((v) =>
    typeof v === "object" && v !== null ? (v as Part) : {},
  )

const axesOf = (option: Part, dim: Dim) => partsOf(option[`${dim}Axis`])

// The axes a control names, in ECharts' order; null when it names none.
const referredAxes = (option: Part, zoom: Part, dim: Dim): number[] | null => {
  const index = zoom[`${dim}AxisIndex`]
  const id = zoom[`${dim}AxisId`]
  const name = zoom[`${dim}AxisName`]
  if (index == null && id == null && name == null) return null
  const axes = axesOf(option, dim)
  if (index === "none" || index === false) return []
  if (index === "all") return axes.map((_, i) => i)
  if (index != null)
    return listOf(index).filter(
      (i): i is number => typeof i === "number" && axes[i] !== undefined,
    )
  const [attr, wanted] = id != null ? ["id", id] : ["name", name]
  const asText = (value: unknown) =>
    typeof value === "string" || typeof value === "number"
      ? String(value)
      : undefined
  const names = listOf(wanted).map(asText)
  return axes.flatMap((axis, i) => {
    const text = asText(axis[attr])
    return text !== undefined && names.includes(text) ? [i] : []
  })
}

/**
 * The axis a dataZoom entry of `option` moves, resolved as ECharts resolves
 * it (DataZoomModel._resetTarget): the first axis it names, else the first
 * axis parallel to its orientation, else the first category axis.
 */
export const zoomKeyOf = (option: Part, zoom: Part): AxisKey | undefined => {
  let named = false
  for (const dim of DIMS) {
    const axes = referredAxes(option, zoom, dim)
    if (axes === null) continue
    named = true
    if (axes.length > 0) return `${dim}${axes[0]}`
  }
  if (named) return undefined
  const orient = zoom.orient ?? "horizontal"
  const parallel = orient === "vertical" ? "y" : "x"
  if (axesOf(option, parallel).length > 0) return `${parallel}0`
  const single = axesOf(option, "single").findIndex(
    (axis) => axis.orient === orient,
  )
  if (single >= 0) return `single${single}`
  for (const dim of DIMS) {
    const index = axesOf(option, dim).findIndex(
      (axis) => axis.type === "category",
    )
    if (index >= 0) return `${dim}${index}`
  }
  return undefined
}

const AXIS_TYPES: AxisType[] = ["time", "value", "log", "category"]

const parseKey = (key: AxisKey): [Dim, number] | undefined => {
  const match = /^([a-z]+)(\d+)$/.exec(key)
  if (!match || !(DIMS as readonly string[]).includes(match[1])) return
  return [match[1] as Dim, Number(match[2])]
}

const axisTypeOf = (option: Part, key: AxisKey): AxisType | undefined => {
  const at = parseKey(key)
  const axis = at && axesOf(option, at[0])[at[1]]
  if (!axis) return undefined
  // ECharts' default: a category axis when it lists its data, else values.
  const type = axis.type ?? (axis.data ? "category" : "value")
  return AXIS_TYPES.find((t) => t === type)
}

const zoomsOf = (option: EChartsOption) => partsOf(option.dataZoom)

export const zoomAxesOf = (option: EChartsOption): ZoomAxes => {
  const raw = option as Part
  const axes: Record<AxisKey, AxisType> = {}
  for (const zoom of zoomsOf(option)) {
    const key = zoomKeyOf(raw, zoom)
    const type = key && axisTypeOf(raw, key)
    if (key && type) axes[key] = type
  }
  return { time: axesOf(raw, "x")[0]?.type === "time", axes }
}

/** The range a state puts on its control; undefined keeps the authored one. */
export const zoomRangeOf = (
  state: ZoomState,
): Record<string, number> | undefined => {
  switch (state.mode) {
    case "default":
      return undefined
    case "full":
      return { start: 0, end: 100 }
    case "pinned":
      return { startValue: state.from, endValue: state.to }
    case "pinned-pct":
      return { start: state.start, end: state.end }
  }
}

const RANGE_KEYS = ["start", "end", "startValue", "endValue"]

/** The authored range of a dataZoom entry, or all the data. */
export const authoredRangeOf = (zoom: unknown): Record<string, unknown> => {
  const range = Object.fromEntries(
    Object.entries((zoom as Part | undefined) ?? {}).filter(
      ([key, value]) => RANGE_KEYS.includes(key) && value != null,
    ),
  )
  return Object.keys(range).length > 0 ? range : { start: 0, end: 100 }
}

/** The dataZoom entry a live control was drawn from. */
export const authoredZoomOf = (
  option: EChartsOption | undefined,
  componentIndex: number,
): unknown => (option ? zoomsOf(option)[componentIndex] : undefined)

/**
 * The option with the view state the user owns written in: each control's
 * window from its zoom state, and the series hidden in the legend. Returns
 * the states it wrote, which the drawn chart now shows.
 */
export const withViewState = (
  option: EChartsOption,
  stateOf: (key: AxisKey) => ZoomState,
  legendSelected: Record<string, boolean> | undefined,
): { option: EChartsOption; states: Map<AxisKey, ZoomState> } => {
  const raw = option as Part
  const states = new Map<AxisKey, ZoomState>()
  let next = option
  if (option.dataZoom != null) {
    const zooms = listOf(option.dataZoom).map((zoom) => {
      if (typeof zoom !== "object" || zoom === null) return zoom
      const key = zoomKeyOf(raw, zoom as Part)
      if (!key) return zoom
      const state = states.get(key) ?? stateOf(key)
      states.set(key, state)
      const range = zoomRangeOf(state)
      if (!range) return zoom
      const kept = Object.fromEntries(
        Object.entries(zoom).filter(([k]) => !RANGE_KEYS.includes(k)),
      )
      return { ...kept, ...range }
    })
    next = { ...next, dataZoom: zooms as EChartsOption["dataZoom"] }
  }
  if (legendSelected && option.legend != null) {
    const select = (legend: unknown) =>
      typeof legend === "object" && legend !== null
        ? {
            ...legend,
            selected: {
              ...((legend as Part).selected as object | undefined),
              ...legendSelected,
            },
          }
        : legend
    next = {
      ...next,
      legend: (Array.isArray(option.legend)
        ? option.legend.map(select)
        : select(option.legend)) as EChartsOption["legend"],
    }
  }
  return { option: next, states }
}

// ── Live controls ────────────────────────────────────────────────────────

/** The axis a live control moves: the first it targets, as ECharts lists. */
export const controlKeyOf = (control: ZoomControl): AxisKey | undefined => {
  let key: AxisKey | undefined
  control.eachTargetAxis((dim, index) => {
    key ??= `${dim}${index}`
  })
  return key
}

const EDGE = 1e-6

/** The zoom state a control shows after the user (or a peer) moved it. */
export const zoomStateOfControl = (
  control: ZoomControl,
  key: AxisKey,
): ZoomState | undefined => {
  const at = parseKey(key)
  const percent = control.getPercentRange()
  if (!at || !percent?.every(Number.isFinite)) return undefined
  if (percent[0] <= EDGE && percent[1] >= 100 - EDGE) return { mode: "full" }
  const type = (
    control.getAxisModel(at[0], at[1]) as
      | { get(key: "type"): unknown }
      | undefined
  )?.get("type")
  const axis = AXIS_TYPES.find((t) => t === type)
  if (axis === undefined || axis === "category")
    return { mode: "pinned-pct", start: percent[0], end: percent[1] }
  const range = control.getValueRange(at[0], at[1])
  if (!range?.every(Number.isFinite))
    return { mode: "pinned-pct", start: percent[0], end: percent[1] }
  return { mode: "pinned", from: range[0], to: range[1], axis }
}
