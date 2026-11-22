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
  type ChartZoomDensity,
} from "./chartDensity"
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
  onZoomChange?: (start: number, end: number) => void
  isFocused?: boolean
  animateEntry?: boolean
  animate?: boolean
  zoomWindow: ZoomWindow
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

type ZoomWindow = { start: number; end: number }

const isZoomed = ({ start, end }: ZoomWindow): boolean => start > 0 || end < 100

const zoomControlsHidden = (density: ChartZoomDensity): boolean =>
  !density.slider && !density.wheel

type MountedZoomControl = {
  id?: string
  type?: string
  disabled?: boolean
  show?: boolean
}

const hasActiveXZoomControl = (mounted: { dataZoom?: unknown }): boolean =>
  Array.isArray(mounted.dataZoom) &&
  (mounted.dataZoom as MountedZoomControl[]).some(
    (control) =>
      isXZoomControl(control.id) &&
      (control.type === "inside" ? !control.disabled : control.show === true),
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
      zoomWindow,
    },
    ref,
  ) {
    const bufferId = useNotebookBufferId()
    const theme = useTheme()
    const [zoomDensity, setZoomDensity] = useState<ChartZoomDensity | null>(
      null,
    )
    const reactEchartsRef = useRef<ReactECharts | null>(null)
    const wrapperRef = useRef<HTMLDivElement | null>(null)
    const zoomWindowRef = useRef(zoomWindow)
    const optionRef = useRef(option)
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
    const optionToDraw = useMemo(
      () =>
        zoomDensity === null ? option : withZoomDensity(option, zoomDensity),
      [option, zoomDensity],
    )
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
          // Y's slider owns its window; do not save that window as X zoom.
          const first = (e.batch ?? [e]).find(
            (change) =>
              change.dataZoomId == null || isXZoomControl(change.dataZoomId),
          )
          if (
            typeof first?.start === "number" &&
            typeof first.end === "number"
          ) {
            onZoomChange(first.start, first.end)
          }
        },
      }
    }, [onZoomChange])

    const measureDensity = useCallback((width: number, height: number) => {
      if (width <= 0 || height <= 0) return
      const next = chartZoomDensity(optionRef.current, width, height)
      setZoomDensity((previous) =>
        previous?.slider === next.slider &&
        previous.wheel === next.wheel &&
        previous.rowSlider === next.rowSlider
          ? previous
          : next,
      )
    }, [])

    const resetZoom = useCallback(() => {
      reactEchartsRef.current?.getEchartsInstance()?.dispatchAction({
        type: "dataZoom",
        start: 0,
        end: 100,
      })
    }, [])

    const handleChartReady = useCallback<
      NonNullable<React.ComponentProps<typeof ReactECharts>["onChartReady"]>
    >(
      (instance) => {
        firstInstanceDoneRef.current = true
        const zoom = zoomWindowRef.current
        if (isZoomed(zoom)) {
          const mounted = instance.getOption() as { dataZoom?: unknown }
          if (hasActiveXZoomControl(mounted)) {
            instance.dispatchAction({
              type: "dataZoom",
              dataZoomId: X_WHEEL_ZOOM_ID,
              start: zoom.start,
              end: zoom.end,
            })
          } else {
            // The remounted chart has no control that could move the window
            // back: report the zoom as gone, or the owner's Reset button keeps
            // pointing at a zoom that no longer exists.
            onZoomChangeRef.current?.(0, 100)
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

    // The density measurement reads the option from a layout effect, so the
    // ref syncs in one too, ahead of it.
    useLayoutEffect(() => {
      optionRef.current = option
    }, [option])

    useEffect(() => {
      zoomWindowRef.current = zoomWindow
    }, [zoomWindow])

    useEffect(() => {
      onZoomChangeRef.current = onZoomChange
    }, [onZoomChange])

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
        measureDensity(box.width, box.height)
      })
      observer.observe(wrapper)

      const handleVisibility = () => {
        if (document.visibilityState !== "visible") return
        requestAnimationFrame(() => {
          const rect = wrapper.getBoundingClientRect()
          resizeTo(rect.width, rect.height)
          measureDensity(rect.width, rect.height)
        })
      }
      document.addEventListener("visibilitychange", handleVisibility)

      return () => {
        observer.disconnect()
        document.removeEventListener("visibilitychange", handleVisibility)
      }
    }, [measureDensity])

    // The chart mounts once the wrapper is measured, so the first instance
    // already carries the right slider decision instead of remounting for it.
    useLayoutEffect(() => {
      const box = wrapperRef.current?.getBoundingClientRect()
      if (box) measureDensity(box.width, box.height)
    }, [measureDensity, option])

    // Without a slider or a wheel nothing can move the window back, so a
    // window that outlives its controls resets and the owner hears it go.
    useEffect(() => {
      if (zoomDensity === null || !zoomControlsHidden(zoomDensity)) return
      if (!isZoomed(zoomWindowRef.current)) return
      reactEchartsRef.current?.getEchartsInstance()?.dispatchAction({
        type: "dataZoom",
        dataZoomId: X_WHEEL_ZOOM_ID,
        start: 0,
        end: 100,
      })
      onZoomChangeRef.current?.(0, 100)
    }, [zoomDensity])

    useImperativeHandle(ref, () => ({ resetZoom }), [resetZoom])

    return (
      <div
        ref={wrapperRef}
        style={{
          width: "100%",
          height: typeof height === "number" ? `${height}px` : height,
        }}
      >
        {zoomDensity !== null && (
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
