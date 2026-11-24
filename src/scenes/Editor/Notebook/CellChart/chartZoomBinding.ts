import type { EChartsOption, EChartsType } from "echarts"
import {
  chartZoomState,
  setChartLegendSelected,
  setChartRoam,
  type ChartRoam,
  setChartZoom,
  setLinkedZoom,
  subscribeChartZoom,
  type ZoomScope,
} from "../cellVirtualization/chartZoomStore"
import { chartSyncOf } from "../interactions/chartSync"
import {
  isTimeChart,
  zoomControls,
  zoomForTarget,
  type ZoomControl,
  type ZoomTarget,
} from "./liveZoom"
import {
  LINKED_AXIS,
  authoredRangeOf,
  authoredZoomOf,
  controlKeyOf,
  sameZoomState,
  zoomAxesOf,
  zoomRangeOf,
  zoomStateOfControl,
  type AxisKey,
  type ZoomState,
} from "./zoomWindow"

// Ties a mounted chart to the zoom store, both ways: a gesture on the chart
// (or a linked zoom through it) is written to the store, and a store change
// (a linked peer's zoom, Reset, an SQL edit) is applied to the chart. This is
// the only module that moves a chart's window with a dataZoom action; a
// redraw writes the windows into the option instead (withViewState).

// Set while this module moves a chart, so the chart's events are not read
// back as the user's gesture.
let driving = false

type DataZoomEvent = ZoomTarget & {
  start?: number
  end?: number
  batch?: ZoomTarget[]
}

const LEGEND_EVENTS = [
  "legendselectchanged",
  "legendselected",
  "legendunselected",
  "legendselectall",
  "legendinverseselect",
]

const ROAM_EVENTS = ["georoam", "graphroam", "treeroam"]

export type ChartZoomBinding = {
  /** The chart was drawn with these states written into its option. */
  drew(states: Map<AxisKey, ZoomState>): void
  dispose(): void
}

export const bindChartZoom = (
  instance: EChartsType,
  scope: ZoomScope,
  // The option last drawn, before the states were written into it.
  authored: () => EChartsOption | undefined,
): ChartZoomBinding => {
  // What each control of the chart shows, as a state.
  const shown = new Map<AxisKey, ZoomState>()

  const firstControls = () => {
    const byKey = new Map<AxisKey, ZoomControl>()
    for (const control of zoomControls(instance)) {
      const key = controlKeyOf(control)
      if (key !== undefined && !byKey.has(key)) byKey.set(key, control)
    }
    return byKey
  }

  const apply = () => {
    if (instance.isDisposed()) return
    const option = authored()
    const axes = option ? zoomAxesOf(option) : undefined
    for (const [key, control] of firstControls()) {
      const state = chartZoomState(scope, key, axes)
      const current = shown.get(key)
      if (current && sameZoomState(current, state)) continue
      shown.set(key, state)
      // Controls moving the same axis follow the one moved.
      const range =
        zoomRangeOf(state) ??
        authoredRangeOf(authoredZoomOf(option, control.componentIndex))
      driving = true
      try {
        instance.dispatchAction(
          {
            type: "dataZoom",
            dataZoomIndex: control.componentIndex,
            ...range,
          },
          { silent: true },
        )
      } finally {
        driving = false
      }
    }
  }

  const onZoom = (payload: unknown) => {
    if (driving || instance.isDisposed()) return
    const event = payload as DataZoomEvent
    const controls = zoomControls(instance)
    const moved = new Set<ZoomControl>()
    for (const target of event.batch ?? [event]) {
      if (target.dataZoomId === undefined && target.dataZoomIndex === undefined)
        controls.forEach((control) => moved.add(control))
      else {
        const control = zoomForTarget(controls, target)
        if (control) moved.add(control)
      }
    }
    const linked =
      chartSyncOf(scope.bufferId)?.zoom === true && isTimeChart(instance)
    const written = new Set<AxisKey>()
    for (const control of moved) {
      const key = controlKeyOf(control)
      if (key === undefined || written.has(key)) continue
      written.add(key)
      const state = zoomStateOfControl(control, key)
      if (!state) continue
      shown.set(key, state)
      if (linked && key === LINKED_AXIS) setLinkedZoom(scope.bufferId, state)
      else setChartZoom(scope, key, state)
    }
  }

  const onLegend = (payload: unknown) => {
    const selected = (payload as { selected?: Record<string, boolean> })
      .selected
    if (selected) setChartLegendSelected(scope, selected)
  }

  // Pans and zooms of roaming maps and graphs: kept as the chart reports
  // them, so a redraw (which replaces the whole option) puts them back.
  const onRoam = () => {
    if (instance.isDisposed()) return
    const drawn = instance.getOption() as Record<string, unknown>
    const roam: ChartRoam = {}
    for (const component of ["series", "geo"] as const) {
      const parts = drawn[component]
      if (!Array.isArray(parts)) continue
      parts.forEach((part: unknown, index) => {
        if (typeof part !== "object" || part === null) return
        const { roam: roams, center, zoom } = part as Record<string, unknown>
        if (!roams || (center === undefined && zoom === undefined)) return
        roam[`${component}.${index}`] = {
          ...(center === undefined ? {} : { center }),
          ...(zoom === undefined ? {} : { zoom }),
        }
      })
    }
    if (Object.keys(roam).length > 0) setChartRoam(scope, roam)
  }

  instance.on("datazoom", onZoom)
  for (const name of LEGEND_EVENTS) instance.on(name, onLegend)
  for (const name of ROAM_EVENTS) instance.on(name, onRoam)
  const unsubscribe = subscribeChartZoom(scope, apply)

  return {
    drew(states) {
      shown.clear()
      states.forEach((state, key) => shown.set(key, state))
      // The store may have moved on while the option was being drawn.
      apply()
    },
    dispose() {
      unsubscribe()
      if (instance.isDisposed()) return
      instance.off("datazoom", onZoom)
      for (const name of LEGEND_EVENTS) instance.off(name, onLegend)
      for (const name of ROAM_EVENTS) instance.off(name, onRoam)
    },
  }
}
