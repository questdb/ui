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
import { chartZoomDensity, type ChartZoomDensity } from "./chartDensity"
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
      areaStyle?: unknown
      step?: unknown
      stack?: unknown
    }
    return [
      spec.type ?? "",
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

type DataZoomEvent = {
  start?: number
  end?: number
  batch?: Array<{ start?: number; end?: number }>
}

type ZoomWindow = { start: number; end: number }

const isZoomed = ({ start, end }: ZoomWindow): boolean => start > 0 || end < 100

const zoomControlsHidden = (density: ChartZoomDensity): boolean =>
  !density.slider && !density.wheel

export const ChartRenderer = React.forwardRef<ChartRendererHandle, Props>(
  function ChartRenderer(
    {
      option,
      height = "100%",
      onZoomChange,
      isFocused = true,
      animateEntry = true,
      zoomWindow,
    },
    ref,
  ) {
    const bufferId = useNotebookBufferId()
    const theme = useTheme()
    const chartTheme = useMemo(
      () => createQuestdbTheme(theme.color),
      [theme.color],
    )
    const [zoomDensity, setZoomDensity] = useState<ChartZoomDensity | null>(
      null,
    )
    const reactEchartsRef = useRef<ReactECharts | null>(null)
    const wrapperRef = useRef<HTMLDivElement | null>(null)
    const zoomWindowRef = useRef(zoomWindow)
    const measuredWidthRef = useRef(0)
    const optionRef = useRef(option)
    // Decided once per mount: a chart mounting into an already-settled
    // notebook (scroll remount) skips the entry animation.
    const animateEntryRef = useRef(
      animateEntry && shouldAnimateChartEntry(bufferId),
    )
    const firstInstanceDoneRef = useRef(false)
    const onZoomChangeRef = useRef(onZoomChange)

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

    const measureDensity = useCallback((width: number) => {
      if (width <= 0) return
      measuredWidthRef.current = width
      const next = chartZoomDensity(optionRef.current, width)
      setZoomDensity((previous) =>
        previous?.slider === next.slider && previous.wheel === next.wheel
          ? previous
          : next,
      )
    }, [])

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
        measureDensity(box.width)
      })
      observer.observe(wrapper)

      const handleVisibility = () => {
        if (document.visibilityState !== "visible") return
        requestAnimationFrame(() => {
          const rect = wrapper.getBoundingClientRect()
          resizeTo(rect.width, rect.height)
        })
      }
      document.addEventListener("visibilitychange", handleVisibility)

      return () => {
        observer.disconnect()
        document.removeEventListener("visibilitychange", handleVisibility)
      }
    }, [measureDensity])

    const resetZoom = useCallback(() => {
      reactEchartsRef.current?.getEchartsInstance()?.dispatchAction({
        type: "dataZoom",
        start: 0,
        end: 100,
      })
    }, [])

    useImperativeHandle(ref, () => ({ resetZoom }), [resetZoom])

    const handleChartReady = useCallback<
      NonNullable<React.ComponentProps<typeof ReactECharts>["onChartReady"]>
    >(
      (instance) => {
        firstInstanceDoneRef.current = true
        const zoom = zoomWindowRef.current
        if (isZoomed(zoom)) {
          const mounted = instance.getOption() as { dataZoom?: unknown[] }
          const density = chartZoomDensity(
            optionRef.current,
            measuredWidthRef.current,
          )
          const restorable =
            Array.isArray(mounted.dataZoom) &&
            mounted.dataZoom.length > 0 &&
            !zoomControlsHidden(density)
          if (restorable) {
            instance.dispatchAction({
              type: "dataZoom",
              start: zoom.start,
              end: zoom.end,
            })
          } else {
            // The remounted chart has no dataZoom, or no control that could
            // move the window back: report the zoom as gone, or the owner's
            // Reset button keeps pointing at a zoom that no longer exists.
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

    // The chart mounts once the wrapper is measured, so the first instance
    // already carries the right slider decision instead of remounting for it.
    useLayoutEffect(() => {
      const width = wrapperRef.current?.getBoundingClientRect().width
      if (width) measureDensity(width)
    }, [measureDensity, option])

    const effectiveDensity = useMemo(
      () =>
        zoomDensity === null
          ? null
          : chartZoomDensity(option, measuredWidthRef.current),
      [option, zoomDensity],
    )

    // Without a slider or a wheel nothing can move the window back, so a
    // window that outlives its controls resets and the owner hears it go.
    useEffect(() => {
      if (effectiveDensity === null || !zoomControlsHidden(effectiveDensity)) {
        return
      }
      if (!isZoomed(zoomWindowRef.current)) return
      resetZoom()
      onZoomChangeRef.current?.(0, 100)
    }, [effectiveDensity, resetZoom])

    const optionToDraw = useMemo(
      () =>
        effectiveDensity === null
          ? option
          : withZoomDensity(option, effectiveDensity),
      [effectiveDensity, option],
    )
    const key = useMemo(() => structuralKey(optionToDraw), [optionToDraw])

    const suppressEntryAnimation =
      !animateEntryRef.current && !firstInstanceDoneRef.current
    const renderOption = useMemo(
      () =>
        suppressEntryAnimation
          ? { ...optionToDraw, animationDuration: 0 }
          : optionToDraw,
      [optionToDraw, suppressEntryAnimation],
    )

    const events = useMemo(() => {
      if (!onZoomChange) return undefined
      return {
        datazoom: (evt: unknown) => {
          const e = evt as DataZoomEvent
          const first = e.batch?.[0] ?? e
          if (
            typeof first.start === "number" &&
            typeof first.end === "number"
          ) {
            onZoomChange(first.start, first.end)
          }
        },
      }
    }, [onZoomChange])

    return (
      <div
        ref={wrapperRef}
        style={{
          width: "100%",
          height: typeof height === "number" ? `${height}px` : height,
        }}
      >
        {effectiveDensity !== null && (
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
