import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { EChartsOption, EChartsType } from "echarts"
import styled, { useTheme } from "styled-components"
import type {
  CellInteractions,
  NotebookChartType,
} from "../../../../store/notebook"
import { withBrush } from "../interactions/chartInteractions"
import {
  ChartRenderer,
  type ChartEventHandler,
} from "../CellChart/ChartRenderer"
import type { StatementRows } from "../visuals/statementRows"
import { setRenderReport, type RenderProblem } from "../renderReports"
import { sanitizeOption } from "./sanitizeOption"
import {
  buildCustomOption,
  customSeriesCount,
  partialDatasetWarnings,
} from "./buildCustomOption"
import { drawErrorsOf, resolveChartTypes } from "./chartTypeRegistry"
import { MAP_NAMES, ensureMaps, isMapLoaded, mapsUsedBy } from "./maps"
import { problemsOf } from "./prepareCustomOption"
import { PaneEmptyState } from "../PaneEmptyState"
import { chartTypesUsedBy } from "./chartTypeUsage"
import {
  isTimeChart,
  primaryXControls,
  zoomForTarget,
} from "../CellChart/liveZoom"
import type { DataZoomEvent } from "../CellChart/zoomWindow"

const MAPS = new Set<string>(MAP_NAMES)

const NO_ZOOM_WINDOW = { start: 0, end: 100 }

const MAP_LOAD_FAILED =
  "Could not load the world map. Reload the console to try again."

const WINDOW_KEYS = ["start", "end", "startValue", "endValue"]

const withoutWindow = (zoom: unknown): unknown =>
  typeof zoom === "object" && zoom !== null && !Array.isArray(zoom)
    ? Object.fromEntries(
        Object.entries(zoom).filter(([key]) => !WINDOW_KEYS.includes(key)),
      )
    : zoom

/**
 * The option without its authored zoom windows: once the chart is zoomed, a
 * refresh's merge must not move it back to the authored window.
 */
const withoutZoomWindows = (
  option: Record<string, unknown>,
): Record<string, unknown> => {
  const strip = (part: Record<string, unknown>) =>
    part.dataZoom === undefined
      ? part
      : {
          ...part,
          dataZoom: Array.isArray(part.dataZoom)
            ? part.dataZoom.map(withoutWindow)
            : withoutWindow(part.dataZoom),
        }
  const base = option.baseOption
  return base && typeof base === "object" && !Array.isArray(base)
    ? { ...strip(option), baseOption: strip(base as Record<string, unknown>) }
    : strip(option)
}

const PartialNotice = styled.div`
  height: 2.8rem;
  padding: 0.5rem 1rem;
  overflow: auto;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const Waiting = styled(PaneEmptyState)`
  padding: 1.6rem;
  text-align: center;
  line-height: 1.5;
`

type Props = {
  bufferId: number
  cellId: string
  rawOption: Record<string, unknown>
  statements: (StatementRows | null)[]
  chartTypes: NotebookChartType[] | undefined
  live: boolean
  isFocused: boolean
  interactions?: CellInteractions
  events?: Record<string, ChartEventHandler>
  onInstance?: React.ComponentProps<typeof ChartRenderer>["onInstance"]
}

/** Draws an agent-written ECharts option over the cell's statements. */
export const CustomChart = ({
  bufferId,
  cellId,
  rawOption,
  statements,
  chartTypes,
  live,
  isFocused,
  interactions,
  events,
  onInstance,
}: Props) => {
  const theme = useTheme()
  const lastTimeZoom = useRef<{
    option: typeof rawOption
    range: [number, number]
  } | null>(null)
  // The option whose drawn chart was zoomed (by the user or a linked chart):
  // its authored window applies when it is drawn, not on later refreshes.
  const [zoomedOption, setZoomedOption] = useState<typeof rawOption | null>(
    null,
  )
  const chartEvents = useMemo(
    () => ({
      ...events,
      datazoom: (payload: unknown, instance: EChartsType) => {
        events?.datazoom?.(payload, instance)
        setZoomedOption(rawOption)
        if (!isTimeChart(instance)) return
        const event = payload as DataZoomEvent
        const controls = primaryXControls(instance)
        for (const target of event.batch ?? [event]) {
          const control = zoomForTarget(controls, target)
          if (!control) continue
          // A full percentage window follows the data domain. Persisting its
          // current endpoints as values would pin it to a stale domain.
          const range = control.getValueRange("x", 0)
          if (target.start === 0 && target.end === 100)
            lastTimeZoom.current = null
          else if (range?.every(Number.isFinite))
            lastTimeZoom.current = { option: rawOption, range }
          break
        }
      },
    }),
    [events, rawOption],
  )
  const handleInstance = useCallback(
    (instance: EChartsType | null) => {
      const previous = lastTimeZoom.current
      let restored = false
      if (instance && previous?.option === rawOption && isTimeChart(instance)) {
        const [control] = primaryXControls(instance)
        if (control) {
          restored = true
          const [startValue, endValue] = previous.range
          instance.dispatchAction(
            {
              type: "dataZoom",
              dataZoomIndex: control.componentIndex,
              startValue,
              endValue,
            },
            { silent: true },
          )
        }
      }
      // A new instance (a theme change, a brush toggled) that gets no zoom
      // back opens on the option's own window again.
      if (instance && !restored) setZoomedOption(null)
      onInstance?.(instance)
    },
    [onInstance, rawOption],
  )
  const resolution = useMemo(
    () => resolveChartTypes(bufferId, chartTypes),
    [bufferId, chartTypes],
  )
  const sanitized = useMemo(
    () =>
      sanitizeOption(rawOption, {
        colors: theme.color,
        renderItems: resolution.renderItems,
        maps: MAPS,
      }),
    [rawOption, theme.color, resolution],
  )
  const built = useMemo(
    () => buildCustomOption(sanitized.option, statements, live),
    [sanitized, statements, live],
  )
  const specKey = useMemo(() => JSON.stringify(sanitized.option), [sanitized])

  const zoomed = zoomedOption === rawOption
  const option = useMemo(() => {
    const raw = zoomed ? withoutZoomWindows(built.option) : built.option
    if (
      raw.baseOption &&
      typeof raw.baseOption === "object" &&
      !Array.isArray(raw.baseOption)
    ) {
      const baseOption = withBrush(
        raw.baseOption as EChartsOption,
        interactions,
      )
      return { ...raw, baseOption } as EChartsOption
    }
    return withBrush(raw as EChartsOption, interactions)
  }, [built, interactions, zoomed])
  const neededMaps = useMemo(() => mapsUsedBy(built.option), [built])
  const [mapStatus, setMapStatus] = useState<"loading" | "error" | "ready">(
    () => (neededMaps.every(isMapLoaded) ? "ready" : "loading"),
  )
  useEffect(() => {
    if (neededMaps.every(isMapLoaded)) {
      setMapStatus("ready")
      return
    }
    setMapStatus("loading")
    let cancelled = false
    void ensureMaps(neededMaps).then(
      () => !cancelled && setMapStatus("ready"),
      () => !cancelled && setMapStatus("error"),
    )
    return () => {
      cancelled = true
    }
  }, [neededMaps])

  useEffect(() => {
    const used = chartTypesUsedBy(rawOption)
    // Chart types throw while drawing, after this render; read them once the
    // frame is out.
    const timer = window.setTimeout(() => {
      const problems: RenderProblem[] = [
        ...problemsOf({ resolution, sanitized, built }),
        ...[...drawErrorsOf(resolution, used)].map(([name, message]) => ({
          path: `chartTypes.${name}`,
          message: `Chart type "${name}" threw while drawing: ${message}`,
          severity: "error" as const,
        })),
        ...(mapStatus === "error"
          ? [{ path: "", message: MAP_LOAD_FAILED, severity: "error" as const }]
          : []),
      ]
      setRenderReport(bufferId, cellId, {
        kind: "custom",
        drawn: {
          series: customSeriesCount(built.option),
          datasets: statements.length,
          rows: statements.reduce((n, s) => n + (s?.rows.length ?? 0), 0),
        },
        problems,
      })
    }, 50)
    return () => window.clearTimeout(timer)
  }, [
    bufferId,
    cellId,
    rawOption,
    sanitized,
    built,
    resolution,
    statements,
    mapStatus,
  ])

  const fatal = [...sanitized.problems, ...built.problems].find(
    (problem) => problem.severity === "error" && problem.path === "",
  )
  if (fatal)
    return <PaneEmptyState role="alert">{fatal.message}</PaneEmptyState>
  if (mapStatus === "error")
    return <PaneEmptyState role="alert">{MAP_LOAD_FAILED}</PaneEmptyState>
  if (mapStatus === "loading")
    return <PaneEmptyState>Loading map…</PaneEmptyState>
  // A chart type whose code is not allowed draws nothing: say why.
  const waiting = chartTypesUsedBy(rawOption).filter(
    (name) =>
      !resolution.renderItems.has(name) &&
      (chartTypes?.some((t) => t.name === name && t.allowed !== true) ?? false),
  )
  if (waiting.length > 0)
    return (
      <Waiting role="status">
        {`This chart uses ${waiting.map((n) => `"${n}"`).join(", ")}, JavaScript that does not run until you allow it: notebook toolbar → Chart types.`}
      </Waiting>
    )

  const partial = partialDatasetWarnings(statements)
  return (
    <>
      {partial.length > 0 && (
        <PartialNotice role="status">
          {partial.map(({ message }) => message).join(" ")}
        </PartialNotice>
      )}
      <ChartRenderer
        option={option}
        height={partial.length > 0 ? "calc(100% - 2.8rem)" : undefined}
        isFocused={isFocused}
        animate={!live}
        zoomWindow={NO_ZOOM_WINDOW}
        zoomable={false}
        fit
        specKey={`${specKey}:${Boolean(interactions?.brush)}`}
        events={chartEvents}
        onInstance={handleInstance}
      />
    </>
  )
}
