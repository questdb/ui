import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { EChartsOption, EChartsType } from "echarts"
import styled, { useTheme } from "styled-components"
import type { CellInteractions } from "../../../../store/notebook"
import { withBrush } from "../interactions/chartInteractions"
import {
  ChartRenderer,
  type ChartEventHandler,
} from "../CellChart/ChartRenderer"
import type { StatementRows } from "../visuals/statementRows"
import { setRenderReport, type RenderProblem } from "../renderReports"
import {
  customSeriesCount,
  datasetPick,
  partialDatasetWarnings,
} from "./buildCustomOption"
import { ensureMaps, isMapLoaded, mapsUsedBy } from "./maps"
import { prepareCustomOption, problemsOf } from "./prepareCustomOption"
import { PaneEmptyState } from "../PaneEmptyState"
import {
  isTimeChart,
  primaryXControls,
  zoomControls,
  zoomForTarget,
} from "../CellChart/liveZoom"
import type { DataZoomEvent } from "../CellChart/zoomWindow"

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
  return strip(option)
}

const PartialNotice = styled.div`
  height: 2.8rem;
  padding: 0.5rem 1rem;
  overflow: auto;
  color: ${({ theme }) => theme.color.contentPrimary};
`

type Props = {
  bufferId: number
  cellId: string
  rawOption: Record<string, unknown>
  statements: (StatementRows | null)[]
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
  live,
  isFocused,
  interactions,
  events,
  onInstance,
}: Props) => {
  const theme = useTheme()
  // The option's content, so a save that leaves it unchanged (a new object
  // with the same JSON) keeps the chart's zoom.
  const optionKey = useMemo(() => JSON.stringify(rawOption), [rawOption])
  // The window the user (or a linked chart) last zoomed this option to, so a
  // new instance (a theme change, a brush toggled) opens on it again.
  const lastZoom = useRef<{
    optionKey: string
    componentIndex: number
    percent: [number, number]
    // A partial time window pinned to linked charts' times.
    times?: [number, number]
  } | null>(null)
  // The option whose drawn chart was zoomed: its authored window applies when
  // it is first drawn, not on later refreshes.
  const [zoomedKey, setZoomedKey] = useState<string | null>(null)
  // The option drawn, for the click: a dataset-bound series' marks are rows
  // of a statement, drawn from the column its encoding names.
  const drawnRef = useRef<{
    option: Record<string, unknown>
    statements: (StatementRows | null)[]
  } | null>(null)
  const chartEvents = useMemo(
    () => ({
      ...events,
      ...(events?.click
        ? {
            click: (payload: unknown, instance: EChartsType) => {
              const drawn = drawnRef.current
              const { seriesIndex, value } = payload as {
                seriesIndex?: unknown
                value?: unknown
              }
              const pick =
                drawn && typeof seriesIndex === "number"
                  ? datasetPick(
                      drawn.option,
                      drawn.statements,
                      seriesIndex,
                      value,
                    )
                  : undefined
              events.click?.(
                pick ? { ...(payload as object), pick } : payload,
                instance,
              )
            },
          }
        : {}),
      datazoom: (payload: unknown, instance: EChartsType) => {
        events?.datazoom?.(payload, instance)
        setZoomedKey(optionKey)
        const event = payload as DataZoomEvent
        const timeChart = isTimeChart(instance)
        const controls = timeChart
          ? primaryXControls(instance)
          : zoomControls(instance)
        for (const target of event.batch ?? [event]) {
          const control = zoomForTarget(controls, target)
          const percent = control?.getPercentRange()
          if (!control || !percent?.every(Number.isFinite)) continue
          // A window held as percentages keeps its share of the refreshed data
          // and comes back as one. A time window chart sync pinned to its
          // peers' times comes back as those times.
          const full = percent[0] <= 0 && percent[1] >= 100
          const pinned =
            timeChart &&
            !full &&
            control.getRangePropMode?.().every((mode) => mode === "value") ===
              true
          const times = pinned ? control.getValueRange("x", 0) : undefined
          lastZoom.current = {
            optionKey,
            componentIndex: control.componentIndex,
            percent,
            ...(times?.every(Number.isFinite) ? { times } : {}),
          }
          break
        }
      },
    }),
    [events, optionKey],
  )
  const handleInstance = useCallback(
    (instance: EChartsType | null) => {
      const previous = lastZoom.current
      let restored = false
      if (instance && previous?.optionKey === optionKey) {
        const control = zoomControls(instance).find(
          ({ componentIndex }) => componentIndex === previous.componentIndex,
        )
        if (control) {
          restored = true
          instance.dispatchAction(
            {
              type: "dataZoom",
              dataZoomIndex: control.componentIndex,
              ...(previous.times
                ? { startValue: previous.times[0], endValue: previous.times[1] }
                : { start: previous.percent[0], end: previous.percent[1] }),
            },
            { silent: true },
          )
        }
      }
      // A new instance that gets no zoom back opens on the option's own
      // window again.
      if (instance && !restored) setZoomedKey(null)
      onInstance?.(instance)
    },
    [onInstance, optionKey],
  )
  const clickable = interactions?.click !== undefined
  const { sanitized, built } = useMemo(
    () =>
      prepareCustomOption(rawOption, {
        colors: theme.color,
        statements,
        live,
        pickable: clickable,
      }),
    [rawOption, theme.color, statements, live, clickable],
  )
  useEffect(() => {
    drawnRef.current = { option: built.option, statements }
  }, [built, statements])
  const specKey = useMemo(() => JSON.stringify(sanitized.option), [sanitized])

  const zoomed = zoomedKey === optionKey
  const option = useMemo(() => {
    const raw = zoomed ? withoutZoomWindows(built.option) : built.option
    return withBrush(raw as EChartsOption, interactions)
  }, [built, interactions, zoomed])
  // Keyed by the map names, so a data refresh does not reload (or retry a
  // failed load of) the same maps.
  const neededMapsKey = useMemo(
    () => mapsUsedBy(built.option).join("\n"),
    [built],
  )
  const neededMaps = useMemo(
    () => (neededMapsKey === "" ? [] : neededMapsKey.split("\n")),
    [neededMapsKey],
  )
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
    const problems: RenderProblem[] = [
      ...problemsOf({ sanitized, built }),
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
  }, [bufferId, cellId, sanitized, built, statements, mapStatus])

  const fatal = [...sanitized.problems, ...built.problems].find(
    (problem) => problem.severity === "error" && problem.path === "",
  )
  if (fatal)
    return <PaneEmptyState role="alert">{fatal.message}</PaneEmptyState>
  if (mapStatus === "error")
    return <PaneEmptyState role="alert">{MAP_LOAD_FAILED}</PaneEmptyState>
  if (mapStatus === "loading")
    return <PaneEmptyState>Loading map…</PaneEmptyState>
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
