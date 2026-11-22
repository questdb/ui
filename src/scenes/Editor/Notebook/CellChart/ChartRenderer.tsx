import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import ReactECharts from "echarts-for-react/lib/core"
import type { EChartsOption } from "echarts"
import { useTheme } from "styled-components"
import { echarts } from "./echartsSetup"
import { withZoomDensity } from "./buildEchartsOption"
import {
  chartZoomDensity,
  X_SLIDER_ZOOM_ID,
  X_WHEEL_ZOOM_ID,
  Y_SLIDER_ZOOM_ID,
  withBoundedHeatmapLabels,
} from "./chartDensity"
import type { ChartZoomAxis, ChartZoomWindows } from "./chartTypes"
import { createQuestdbTheme } from "./questdbTheme"
import { useNotebookBufferId } from "../NotebookProvider"
import {
  settleChartEntryAnimation,
  shouldAnimateChartEntry,
} from "./chartEntryAnimation"

export type ChartRendererHandle = {
  resetZoom: () => void
}

type Props = {
  option: EChartsOption
  height?: number | string
  onZoomChange?: (axis: ChartZoomAxis, start: number, end: number) => void
  isFocused?: boolean
  animateEntry?: boolean
  animate?: boolean
  zoomWindows: ChartZoomWindows | undefined
}

// Structural fingerprint — we remount on changes here so stale series from
// the prior option don't linger; routine data refreshes keep the key stable
// so dataZoom state survives the merge.
const structuralKey = (option: EChartsOption): string => {
  const rawSeries = option.series
  const series = Array.isArray(rawSeries)
    ? rawSeries
    : rawSeries
      ? [rawSeries]
      : []
  const seriesTypes = series.map((s) => {
    const spec = s as {
      type?: string
      id?: string
      areaStyle?: unknown
      step?: unknown
      stack?: unknown
    }
    return [
      spec.type ?? "",
      spec.id ?? "",
      spec.areaStyle ? "a" : "",
      spec.step ? "s" : "",
      spec.stack ? "k" : "",
    ].join("")
  })
  const xAxis = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis
  const yAxis = Array.isArray(option.yAxis) ? option.yAxis[0] : option.yAxis
  const hasZoom = Array.isArray(option.dataZoom) && option.dataZoom.length > 0
  const axisCount = Array.isArray(option.yAxis) ? "2y" : "1y"
  return [
    seriesTypes.join("|"),
    (xAxis as { type?: string } | undefined)?.type ?? "",
    (yAxis as { type?: string } | undefined)?.type ?? "",
    axisCount,
    hasZoom ? "z" : "nz",
  ].join("::")
}

type ZoomChange = { dataZoomId?: string; start?: number; end?: number }
type DataZoomEvent = ZoomChange & { batch?: ZoomChange[] }

const isXZoomControl = (id?: string) =>
  id === X_SLIDER_ZOOM_ID || id === X_WHEEL_ZOOM_ID

const ZOOM_AXES = ["x", "y"] as const
const zoomControlId = { x: X_WHEEL_ZOOM_ID, y: Y_SLIDER_ZOOM_ID }

const axisForControl = (id?: string): ChartZoomAxis | undefined =>
  id === Y_SLIDER_ZOOM_ID
    ? "y"
    : id == null || isXZoomControl(id)
      ? "x"
      : undefined

type MountedZoomControl = {
  id?: string
  type?: string
  disabled?: boolean
  show?: boolean
}

const hasActiveZoomControl = (
  mounted: { dataZoom?: unknown },
  axis: ChartZoomAxis,
): boolean =>
  Array.isArray(mounted.dataZoom) &&
  (mounted.dataZoom as MountedZoomControl[]).some(
    (control) =>
      control.id != null &&
      axisForControl(control.id) === axis &&
      (control.type === "inside" ? !control.disabled : control.show === true),
  )

const applyZoom = (
  instance: ReturnType<ReactECharts["getEchartsInstance"]> | undefined,
  axis: ChartZoomAxis,
  start: number,
  end: number,
) =>
  instance?.dispatchAction(
    { type: "dataZoom", dataZoomId: zoomControlId[axis], start, end },
    { silent: true },
  )

export const ChartRenderer = React.forwardRef<ChartRendererHandle, Props>(
  function ChartRenderer(
    {
      option,
      height = "100%",
      onZoomChange,
      isFocused = true,
      animateEntry = true,
      animate = true,
      zoomWindows,
    },
    ref,
  ) {
    const bufferId = useNotebookBufferId()
    const theme = useTheme()
    const [size, setSize] = useState<{ width: number; height: number } | null>(
      null,
    )
    const reactEchartsRef = useRef<ReactECharts | null>(null)
    const wrapperRef = useRef<HTMLDivElement | null>(null)
    const zoomWindowsRef = useRef(zoomWindows)
    // Decided once per mount: a chart mounting into an already-settled
    // notebook (scroll remount) skips the entry animation.
    const animateEntryRef = useRef(
      animateEntry && shouldAnimateChartEntry(bufferId),
    )
    const firstInstanceDoneRef = useRef(false)
    const onZoomChangeRef = useRef(onZoomChange)

    const chartTheme = useMemo(
      () => createQuestdbTheme(theme.color),
      [theme.color],
    )
    const layout = useMemo(() => {
      if (!size) return null
      const bounded = withBoundedHeatmapLabels(option, size.width)
      const density = chartZoomDensity(bounded, size.width, size.height)
      return { density, option: withZoomDensity(bounded, density) }
    }, [option, size])
    const optionToDraw = layout?.option ?? option
    const key = useMemo(() => structuralKey(optionToDraw), [optionToDraw])
    const suppressEntryAnimation =
      !animateEntryRef.current && !firstInstanceDoneRef.current
    const renderOption = useMemo(
      () => ({
        ...(suppressEntryAnimation
          ? { ...optionToDraw, animationDuration: 0 }
          : optionToDraw),
        animation: animate,
      }),
      [optionToDraw, suppressEntryAnimation, animate],
    )
    const events = useMemo(() => {
      if (!onZoomChange) return undefined
      return {
        datazoom: (evt: unknown) => {
          const e = evt as DataZoomEvent
          const changes = e.batch ?? [e]
          for (const axis of ZOOM_AXES) {
            const change = changes.find(
              (change) => axisForControl(change.dataZoomId) === axis,
            )
            if (
              typeof change?.start === "number" &&
              typeof change.end === "number"
            ) {
              onZoomChange(axis, change.start, change.end)
            }
          }
        },
      }
    }, [onZoomChange])

    const measure = useCallback((width: number, height: number) => {
      if (width <= 0 || height <= 0) return
      setSize((previous) =>
        previous?.width === width && previous.height === height
          ? previous
          : { width, height },
      )
    }, [])

    const resetZoom = useCallback(() => {
      const instance = reactEchartsRef.current?.getEchartsInstance()
      for (const axis of ZOOM_AXES) applyZoom(instance, axis, 0, 100)
    }, [])

    const handleChartReady = useCallback<
      NonNullable<React.ComponentProps<typeof ReactECharts>["onChartReady"]>
    >(
      (instance) => {
        firstInstanceDoneRef.current = true
        const mounted = instance.getOption() as { dataZoom?: unknown }
        for (const axis of ZOOM_AXES) {
          const window = zoomWindowsRef.current?.[axis]
          if (!window) continue
          if (hasActiveZoomControl(mounted, axis)) {
            applyZoom(instance, axis, window.start, window.end)
          } else {
            onZoomChangeRef.current?.(axis, 0, 100)
          }
        }
        if (animateEntryRef.current) {
          const onFinished = () => {
            instance.off("finished", onFinished)
            settleChartEntryAnimation(bufferId)
          }
          instance.on("finished", onFinished)
        }
      },
      [bufferId],
    )

    useLayoutEffect(() => {
      zoomWindowsRef.current = zoomWindows
      onZoomChangeRef.current = onZoomChange
    }, [onZoomChange, zoomWindows])

    // Capture-phase wheel listener must intercept BEFORE ECharts' inner
    // listeners so the page scrolls instead of ECharts preventDefaulting.
    useEffect(() => {
      if (isFocused) return
      const node = wrapperRef.current
      if (!node) return
      const stop = (e: WheelEvent) => {
        e.stopPropagation()
      }
      node.addEventListener("wheel", stop, { capture: true })
      return () => node.removeEventListener("wheel", stop, { capture: true })
    }, [isFocused])

    useEffect(() => {
      const wrapper = wrapperRef.current
      if (!wrapper) return

      const resizeTo = (width: number, height: number) => {
        if (width === 0 || height === 0) return
        reactEchartsRef.current?.getEchartsInstance()?.resize({ width, height })
      }

      const observer = new ResizeObserver((entries) => {
        const box = entries[0]?.contentRect
        if (!box) return
        resizeTo(box.width, box.height)
        measure(box.width, box.height)
      })
      observer.observe(wrapper)

      const handleVisibility = () => {
        if (document.visibilityState !== "visible") return
        requestAnimationFrame(() => {
          const rect = wrapper.getBoundingClientRect()
          resizeTo(rect.width, rect.height)
          measure(rect.width, rect.height)
        })
      }
      document.addEventListener("visibilitychange", handleVisibility)

      return () => {
        observer.disconnect()
        document.removeEventListener("visibilitychange", handleVisibility)
      }
    }, [measure])

    // The chart mounts once the wrapper is measured, so the first instance
    // already carries the right slider decision instead of remounting for it.
    useLayoutEffect(() => {
      const box = wrapperRef.current?.getBoundingClientRect()
      if (box) measure(box.width, box.height)
    }, [measure])

    // Losing one axis's controls must not clear the other axis's window.
    const xZoomActive = layout?.density.slider || layout?.density.wheel
    const yZoomActive = layout?.density.rowSlider
    useEffect(() => {
      if (xZoomActive === undefined || yZoomActive === undefined) return
      for (const axis of ZOOM_AXES) {
        if (
          (axis === "x" ? xZoomActive : yZoomActive) ||
          !zoomWindowsRef.current?.[axis]
        )
          continue
        applyZoom(reactEchartsRef.current?.getEchartsInstance(), axis, 0, 100)
        onZoomChangeRef.current?.(axis, 0, 100)
      }
    }, [xZoomActive, yZoomActive])

    useImperativeHandle(ref, () => ({ resetZoom }), [resetZoom])

    return (
      <div
        ref={wrapperRef}
        style={{
          width: "100%",
          height: typeof height === "number" ? `${height}px` : height,
        }}
      >
        {layout !== null && (
          <ReactECharts
            key={`${theme.mode}:${key}`}
            ref={reactEchartsRef}
            echarts={echarts}
            option={renderOption}
            theme={chartTheme}
            notMerge={false}
            lazyUpdate
            autoResize={false}
            onEvents={events}
            onChartReady={handleChartReady}
            style={{ height: "100%", width: "100%" }}
            opts={{ renderer: "canvas" }}
          />
        )}
      </div>
    )
  },
)
