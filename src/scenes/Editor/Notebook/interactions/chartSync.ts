import type { EChartsType } from "echarts"
import type { ChartSync } from "../../../../store/notebook"

// Links a notebook's time charts: moving over one shows the same time on the
// others (a crosshair, optionally with their tooltips), and zooming one zooms
// the others to the same time window. Charts join by notebook; each chart
// registers its live instance and leaves on unmount.

type Member = { instance: EChartsType; off: () => void }

const groups = new Map<number, Set<Member>>()
const settings = new Map<number, ChartSync>()
// Set while this module drives charts, so their events are not echoed back.
let driving = false

const isTimeChart = (instance: EChartsType): boolean => {
  const option = instance.getOption() as { xAxis?: { type?: string }[] }
  return option.xAxis?.[0]?.type === "time"
}

const xToPixel = (instance: EChartsType, value: number): number | null => {
  try {
    const px = instance.convertToPixel({ xAxisIndex: 0 }, value)
    return typeof px === "number" && Number.isFinite(px) ? px : null
  } catch {
    return null
  }
}

const others = (bufferId: number, source: EChartsType) =>
  [...(groups.get(bufferId) ?? [])].filter(
    (m) => m.instance !== source && !m.instance.isDisposed(),
  )

const drive = (fn: () => void) => {
  driving = true
  try {
    fn()
  } finally {
    driving = false
  }
}

const showTime = (bufferId: number, source: EChartsType, value: number) => {
  const sync = settings.get(bufferId)
  if (!sync || sync.crosshair === "off") return
  drive(() => {
    for (const { instance } of others(bufferId, source)) {
      if (!isTimeChart(instance)) continue
      const x = xToPixel(instance, value)
      if (x === null) continue
      const y = instance.getHeight() / 2
      if (sync.crosshair === "tooltip") {
        instance.dispatchAction({ type: "showTip", x, y })
      } else {
        instance.dispatchAction({
          type: "updateAxisPointer",
          currTrigger: "mousemove",
          x,
          y,
          tooltipOption: { showContent: false },
        })
      }
    }
  })
}

const hideTime = (bufferId: number, source: EChartsType) => {
  drive(() => {
    for (const { instance } of others(bufferId, source)) {
      if (!isTimeChart(instance)) continue
      instance.dispatchAction({ type: "hideTip" })
      instance.dispatchAction({
        type: "updateAxisPointer",
        currTrigger: "leave",
      })
    }
  })
}

type Zoom = {
  startValue?: number
  endValue?: number
  xAxisIndex?: number | number[] | false
  yAxisIndex?: number | number[] | false
  radiusAxisIndex?: number | number[] | false
  angleAxisIndex?: number | number[] | false
  singleAxisIndex?: number | number[] | false
  orient?: string
}

const zoomsOf = (instance: EChartsType): Zoom[] =>
  (instance.getOption() as { dataZoom?: Zoom[] }).dataZoom ?? []

const controlsPrimaryX = (zoom: Zoom): boolean => {
  if (zoom.xAxisIndex !== undefined)
    return Array.isArray(zoom.xAxisIndex)
      ? zoom.xAxisIndex.includes(0)
      : zoom.xAxisIndex === 0
  return (
    zoom.yAxisIndex === undefined &&
    zoom.radiusAxisIndex === undefined &&
    zoom.angleAxisIndex === undefined &&
    zoom.singleAxisIndex === undefined &&
    zoom.orient !== "vertical"
  )
}

const zoomTo = (bufferId: number, source: EChartsType) => {
  const sync = settings.get(bufferId)
  if (!sync?.zoom || !isTimeChart(source)) return
  const zoom = zoomsOf(source).find(controlsPrimaryX)
  if (zoom?.startValue === undefined || zoom.endValue === undefined) return
  drive(() => {
    for (const { instance } of others(bufferId, source)) {
      if (!isTimeChart(instance)) continue
      const dataZoomIndex = zoomsOf(instance).findIndex(controlsPrimaryX)
      if (dataZoomIndex < 0) continue
      instance.dispatchAction({
        type: "dataZoom",
        dataZoomIndex,
        startValue: zoom.startValue,
        endValue: zoom.endValue,
      })
    }
  })
}

export const setChartSync = (bufferId: number, sync: ChartSync | undefined) => {
  if (sync) settings.set(bufferId, sync)
  else settings.delete(bufferId)
}

/** Adds a chart to its notebook's group; returns the function that removes it. */
export const joinChartSync = (
  bufferId: number,
  instance: EChartsType,
): (() => void) => {
  const onPointer = (event: unknown) => {
    const sync = settings.get(bufferId)
    if (driving || !sync || sync.crosshair === "off" || !isTimeChart(instance))
      return
    const info = (
      event as {
        axesInfo?: { axisDim?: string; axisIndex?: number; value?: unknown }[]
      }
    ).axesInfo
    const x = info?.find((a) => a.axisDim === "x" && a.axisIndex === 0)
    if (typeof x?.value === "number") showTime(bufferId, instance, x.value)
  }
  const onOut = () => {
    const sync = settings.get(bufferId)
    if (!driving && sync && sync.crosshair !== "off" && isTimeChart(instance))
      hideTime(bufferId, instance)
  }
  const onZoom = () => {
    if (!driving) zoomTo(bufferId, instance)
  }
  instance.on("updateAxisPointer", onPointer)
  instance.on("globalout", onOut)
  instance.on("datazoom", onZoom)
  const member: Member = {
    instance,
    off: () => {
      if (instance.isDisposed()) return
      instance.off("updateAxisPointer", onPointer)
      instance.off("globalout", onOut)
      instance.off("datazoom", onZoom)
    },
  }
  let group = groups.get(bufferId)
  if (!group) {
    group = new Set()
    groups.set(bufferId, group)
  }
  group.add(member)
  return () => {
    member.off()
    group.delete(member)
  }
}
