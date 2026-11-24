import React, {
  useCallback,
  useEffect,
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
import { bindChartZoom, type ChartZoomBinding } from "./chartZoomBinding"
import {
  withViewState,
  zoomAxesOf,
  type AxisKey,
  type ZoomState,
} from "./zoomWindow"
import {
  chartLegendSelected,
  chartZoomState,
  resetOwnChartZoom,
  setChartZoomAxes,
  type ZoomScope,
} from "../cellVirtualization/chartZoomStore"
import { useNotebookBufferId } from "../NotebookProvider"
import {
  settleChartEntryAnimation,
  shouldAnimateChartEntry,
} from "./chartEntryAnimation"

export type ChartEventHandler = (params: unknown, instance: EChartsType) => void

type Props = {
  option: EChartsOption
  height?: number | string
  isFocused?: boolean
  animateEntry?: boolean
  animate?: boolean
  // Where the chart's zoom and legend selection are kept. Without it they
  // last until the next redraw.
  zoomScope?: ZoomScope
  // False for options that manage their own zoom (custom options, visuals):
  // the renderer then adds no zoom controls.
  zoomable?: boolean
  /** Lay the option out for the panel's size (custom options, visuals). */
  fit?: boolean
  // ECharts events (click, brushEnd, …).
  events?: Record<string, ChartEventHandler>
  // Called with the live instance after it mounts, and with null on unmount.
  onInstance?: (instance: EChartsType | null) => void
  // Called after each draw: the runtime state a full redraw resets (the
  // brush cursor) is set again here.
  onDraw?: (instance: EChartsType) => void
}

const NO_ZOOM: ChartZoomDensity = { slider: false, wheel: false }
const NO_STATES = new Map<AxisKey, ZoomState>()

const zoomControlsHidden = (density: ChartZoomDensity): boolean =>
  !density.slider && !density.wheel

export const ChartRenderer = ({
  option,
  height = "100%",
  isFocused = true,
  animateEntry = true,
  animate = true,
  zoomScope,
  zoomable = true,
  fit = false,
  events: extraEvents,
  onInstance,
  onDraw,
}: Props) => {
  const bufferId = useNotebookBufferId()
  const theme = useTheme()
  const [zoomDensity, setZoomDensity] = useState<ChartZoomDensity | null>(null)
  const reactEchartsRef = useRef<ReactECharts | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const optionRef = useRef(option)
  // Decided once per mount: a chart mounting into an already-settled
  // notebook (scroll remount) skips the entry animation.
  const animateEntryRef = useRef(
    animateEntry && shouldAnimateChartEntry(bufferId),
  )
  const firstInstanceDoneRef = useRef(false)
  const onInstanceRef = useRef(onInstance)
  useEffect(() => {
    onInstanceRef.current = onInstance
  }, [onInstance])
  const onDrawRef = useRef(onDraw)
  useEffect(() => {
    onDrawRef.current = onDraw
  }, [onDraw])

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
      !zoomable || density === null ? option : withZoomDensity(option, density)
    return fit && size ? fitLayout(zoomed, size) : zoomed
  }, [option, density, zoomable, fit, size])
  const optionToDrawRef = useRef(optionToDraw)
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
  // Every draw replaces the whole option, so a new instance is needed only
  // where ECharts asks for one: a theme is fixed when an instance is made.
  const key = theme.mode
  const scopeBuffer = zoomScope?.bufferId
  const scopeCell = zoomScope?.cellId
  const scope = useMemo(
    () =>
      scopeBuffer === undefined || scopeCell === undefined
        ? undefined
        : { bufferId: scopeBuffer, cellId: scopeCell },
    [scopeBuffer, scopeCell],
  )
  const zoomAxes = useMemo(() => zoomAxesOf(optionToDraw), [optionToDraw])
  const suppressEntryAnimation =
    !animateEntryRef.current && !firstInstanceDoneRef.current
  // The option drawn: the chart's option with the zoom windows and legend
  // selection the store holds. Read when the option changes or a new instance
  // mounts; changes in between reach the instance through its zoom binding.
  const drawn = useMemo(() => {
    const view = scope
      ? withViewState(
          optionToDraw,
          (axis) => chartZoomState(scope, axis, zoomAxes),
          chartLegendSelected(scope),
        )
      : { option: optionToDraw, states: NO_STATES }
    return {
      states: view.states,
      option: {
        ...(suppressEntryAnimation
          ? { ...view.option, animationDuration: 0 }
          : view.option),
        animation: animate,
      },
    }
    // `key`: a new instance draws from the store as it is now.
  }, [optionToDraw, zoomAxes, scope, suppressEntryAnimation, animate, key])
  const drawnRef = useRef(drawn)
  const instanceRef = useRef<EChartsType | null>(null)
  const bindingRef = useRef<ChartZoomBinding | null>(null)
  useEffect(
    () => () => {
      // A remount's new instance can become ready before this deferred
      // cleanup runs; only the disposed instance of the old key is released.
      const instance = instanceRef.current
      if (instance && !instance.isDisposed()) return
      bindingRef.current?.dispose()
      bindingRef.current = null
      instanceRef.current = null
      onInstanceRef.current?.(null)
    },
    [key],
  )
  useEffect(
    () => () => {
      bindingRef.current?.dispose()
      bindingRef.current = null
    },
    [],
  )
  const events = useMemo(() => {
    const bound: Record<string, (params: unknown) => void> = {}
    for (const [name, handler] of Object.entries(extraEvents ?? {})) {
      bound[name] = (params: unknown) => {
        const instance = instanceRef.current
        if (instance) handler(params, instance)
      }
    }
    return bound
  }, [extraEvents])

  const measureDensity = useCallback((width: number, height: number) => {
    if (width <= 0) return
    const next = chartZoomDensity(optionRef.current, width, height)
    setZoomDensity((previous) =>
      previous?.slider === next.slider && previous.wheel === next.wheel
        ? previous
        : next,
    )
  }, [])

  const handleChartReady = useCallback<
    NonNullable<React.ComponentProps<typeof ReactECharts>["onChartReady"]>
  >(
    (instance) => {
      bindingRef.current?.dispose()
      bindingRef.current = null
      instanceRef.current = instance
      if (scope) {
        setChartZoomAxes(scope, zoomAxesOf(optionToDrawRef.current))
        const binding = bindChartZoom(
          instance,
          scope,
          () => optionToDrawRef.current,
        )
        bindingRef.current = binding
        binding.drew(drawnRef.current.states)
      }
      onDrawRef.current?.(instance)
      onInstanceRef.current?.(instance)
      firstInstanceDoneRef.current = true
      if (animateEntryRef.current) {
        const onFinished = () => {
          instance.off("finished", onFinished)
          settleChartEntryAnimation(bufferId)
        }
        instance.on("finished", onFinished)
      }
    },
    [bufferId, scope],
  )

  // The density measurement reads the option from a layout effect, so the
  // ref syncs in one too, ahead of it.
  useLayoutEffect(() => {
    optionRef.current = option
  }, [option])

  // ECharts has drawn the new option (echarts-for-react sets it in its own
  // commit, which runs before this one).
  useLayoutEffect(() => {
    optionToDrawRef.current = optionToDraw
    drawnRef.current = drawn
    const instance = instanceRef.current
    if (!instance || instance.isDisposed()) return
    if (scope) setChartZoomAxes(scope, zoomAxes)
    bindingRef.current?.drew(drawn.states)
    onDrawRef.current?.(instance)
  }, [drawn, optionToDraw, scope, zoomAxes])

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
  // window the chart holds on its own resets (a linked window stays).
  useEffect(() => {
    if (!zoomable || !scope) return
    if (zoomDensity === null || !zoomControlsHidden(zoomDensity)) return
    resetOwnChartZoom(scope)
  }, [zoomDensity, zoomable, scope])

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
          option={drawn.option}
          theme={chartTheme}
          notMerge
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
}
