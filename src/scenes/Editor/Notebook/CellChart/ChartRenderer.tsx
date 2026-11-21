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
import type { EChartsOption, EChartsType } from "echarts"
import { useTheme } from "styled-components"
import { echarts } from "./echartsSetup"
import { withZoomDensity } from "./buildEchartsOption"
import { fitLayout } from "./fitLayout"
import { chartZoomDensity, type ChartZoomDensity } from "./chartDensity"
import { createQuestdbTheme } from "./questdbTheme"
import {
  zoomWindowForEvent,
  type DataZoomEvent,
  type ZoomWindow,
} from "./zoomWindow"
import { useNotebookBufferId } from "../NotebookProvider"
import {
  settleChartEntryAnimation,
  shouldAnimateChartEntry,
} from "./chartEntryAnimation"

export type ChartRendererHandle = {
  resetZoom: () => void
}

export type ChartEventHandler = (params: unknown, instance: EChartsType) => void

type Props = {
  option: EChartsOption
  height?: number | string
  onZoomChange?: (start: number, end: number) => void
  isFocused?: boolean
  animateEntry?: boolean
  animate?: boolean
  zoomWindow: ZoomWindow
  // False for options that manage their own zoom (custom options, visuals):
  // the renderer then adds no zoom controls.
  zoomable?: boolean
  /** Lay the option out for the panel's size (custom options, visuals). */
  fit?: boolean
  // Changes when the chart's specification changes, so a new spec draws on a
  // fresh instance instead of merging into the previous one.
  specKey?: string
  // ECharts events (click, brushEnd, datazoom, …) besides the zoom tracking.
  events?: Record<string, ChartEventHandler>
  // Called with the live instance after it mounts, and with null on unmount.
  onInstance?: (instance: EChartsType | null) => void
}

const NO_ZOOM: ChartZoomDensity = { slider: false, wheel: false }

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
    option.brush ? "brush" : "no-brush",
  ].join("::")
}

const isZoomed = ({ start, end }: ZoomWindow): boolean => start > 0 || end < 100

const zoomControlsHidden = (density: ChartZoomDensity): boolean =>
  !density.slider && !density.wheel

type MountedZoomControl = { type?: string; disabled?: boolean; show?: boolean }

const hasActiveZoomControl = (mounted: { dataZoom?: unknown }): boolean =>
  Array.isArray(mounted.dataZoom) &&
  (mounted.dataZoom as MountedZoomControl[]).some((control) =>
    control.type === "inside" ? !control.disabled : control.show === true,
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
      zoomable = true,
      fit = false,
      specKey,
      events: extraEvents,
      onInstance,
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
    const onInstanceRef = useRef(onInstance)
    useEffect(() => {
      onInstanceRef.current = onInstance
    }, [onInstance])

    const chartTheme = useMemo(
      () => createQuestdbTheme(theme.color),
      [theme.color],
    )
    const density = zoomable ? zoomDensity : NO_ZOOM
    const [size, setSize] = useState<{ width: number; height: number } | null>(
      null,
    )
    const optionToDraw = useMemo(() => {
      const zoomed =
        !zoomable || density === null
          ? option
          : withZoomDensity(option, density)
      return fit && size ? fitLayout(zoomed, size) : zoomed
    }, [option, density, zoomable, fit, size])
    const measureSize = useCallback(
      (width: number, height: number) => {
        if (!fit || width <= 0 || height <= 0) return
        setSize((previous) =>
          previous &&
          Math.abs(previous.width - width) < 1 &&
          Math.abs(previous.height - height) < 1
            ? previous
            : { width, height },
        )
      },
      [fit],
    )
    // ECharts 6.1 setTheme replays the first setOption rather than the
    // latest merged frame. Mount from the current option and restore zoom.
    const key = useMemo(
      () => `${theme.mode}::${specKey ?? ""}::${structuralKey(optionToDraw)}`,
      [optionToDraw, specKey, theme.mode],
    )
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
    const instanceRef = useRef<EChartsType | null>(null)
    useEffect(
      () => () => {
        instanceRef.current = null
        onInstanceRef.current?.(null)
      },
      [key],
    )
    const events = useMemo(() => {
      const bound: Record<string, (params: unknown) => void> = {}
      for (const [name, handler] of Object.entries(extraEvents ?? {})) {
        bound[name] = (params: unknown) => {
          const instance = instanceRef.current
          if (instance) handler(params, instance)
        }
      }
      if (!onZoomChange) return bound
      const zoomHandler = bound.datazoom
      return {
        ...bound,
        datazoom: (evt: unknown) => {
          zoomHandler?.(evt)
          const zoom = zoomWindowForEvent(
            evt as DataZoomEvent,
            instanceRef.current,
          )
          if (zoom) onZoomChange(zoom.start, zoom.end)
        },
      }
    }, [onZoomChange, extraEvents])

    const measureDensity = useCallback((width: number, height: number) => {
      if (width <= 0) return
      const next = chartZoomDensity(optionRef.current, width, height)
      setZoomDensity((previous) =>
        previous?.slider === next.slider && previous.wheel === next.wheel
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
        instanceRef.current = instance
        onInstanceRef.current?.(instance)
        firstInstanceDoneRef.current = true
        const zoom = zoomWindowRef.current
        if (isZoomed(zoom)) {
          const mounted = instance.getOption() as { dataZoom?: unknown }
          if (hasActiveZoomControl(mounted)) {
            instance.dispatchAction({
              type: "dataZoom",
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
        measureSize(box.width, box.height)
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
    }, [measureDensity, measureSize])

    // The chart mounts once the wrapper is measured, so the first instance
    // already carries the right slider decision instead of remounting for it.
    useLayoutEffect(() => {
      const rect = wrapperRef.current?.getBoundingClientRect()
      if (rect?.width) measureDensity(rect.width, rect.height)
      if (rect) measureSize(rect.width, rect.height)
    }, [measureDensity, measureSize, option])

    // Without a slider or a wheel nothing can move the window back, so a
    // window that outlives its controls resets and the owner hears it go.
    useEffect(() => {
      if (!zoomable) return
      if (zoomDensity === null || !zoomControlsHidden(zoomDensity)) return
      if (!isZoomed(zoomWindowRef.current)) return
      resetZoom()
      onZoomChangeRef.current?.(0, 100)
    }, [zoomDensity, resetZoom, zoomable])

    useImperativeHandle(ref, () => ({ resetZoom }), [resetZoom])

    return (
      <div
        ref={wrapperRef}
        style={{
          width: "100%",
          height: typeof height === "number" ? `${height}px` : height,
        }}
      >
        {density !== null && (!fit || size !== null) && (
          <ReactECharts
            key={key}
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
