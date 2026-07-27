import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react"
import ReactECharts from "echarts-for-react/lib/core"
import type { EChartsOption } from "echarts"
import { echarts, QUESTDB_THEME } from "./echartsSetup"
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
  zoomWindow: { start: number; end: number }
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

export const ChartRenderer = React.forwardRef<ChartRendererHandle, Props>(
  function ChartRenderer(
    { option, height = "100%", onZoomChange, isFocused = true, zoomWindow },
    ref,
  ) {
    const bufferId = useNotebookBufferId()
    const reactEchartsRef = useRef<ReactECharts | null>(null)
    const wrapperRef = useRef<HTMLDivElement | null>(null)
    const zoomWindowRef = useRef(zoomWindow)
    // Decided once per mount: a chart mounting into an already-settled
    // notebook (scroll remount) skips the entry animation.
    const animateEntryRef = useRef(shouldAnimateChartEntry(bufferId))
    const firstInstanceDoneRef = useRef(false)

    useEffect(() => {
      zoomWindowRef.current = zoomWindow
    }, [zoomWindow])

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
        if (box) resizeTo(box.width, box.height)
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
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        resetZoom: () => {
          const instance = reactEchartsRef.current?.getEchartsInstance()
          instance?.dispatchAction({
            type: "dataZoom",
            start: 0,
            end: 100,
          })
        },
      }),
      [],
    )

    const handleChartReady = useCallback<
      NonNullable<React.ComponentProps<typeof ReactECharts>["onChartReady"]>
    >(
      (instance) => {
        firstInstanceDoneRef.current = true
        const zoom = zoomWindowRef.current
        if (zoom.start > 0 || zoom.end < 100) {
          instance.dispatchAction({
            type: "dataZoom",
            start: zoom.start,
            end: zoom.end,
          })
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

    const key = useMemo(() => structuralKey(option), [option])

    const suppressEntryAnimation =
      !animateEntryRef.current && !firstInstanceDoneRef.current
    const renderOption = useMemo(
      () =>
        suppressEntryAnimation ? { ...option, animationDuration: 0 } : option,
      [option, suppressEntryAnimation],
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
        <ReactECharts
          key={key}
          ref={reactEchartsRef}
          echarts={echarts}
          option={renderOption}
          theme={QUESTDB_THEME}
          notMerge={false}
          lazyUpdate
          autoResize={false}
          onEvents={events}
          onChartReady={handleChartReady}
          style={{ height: "100%", width: "100%" }}
          opts={{ renderer: "canvas" }}
        />
      </div>
    )
  },
)
