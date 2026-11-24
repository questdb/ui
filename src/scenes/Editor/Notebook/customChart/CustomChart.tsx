import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
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
import { resetChartZoom } from "../cellVirtualization/chartZoomStore"

const MAP_LOAD_FAILED =
  "Could not load the world map. Reload the console to try again."

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
  onDraw?: React.ComponentProps<typeof ChartRenderer>["onDraw"]
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
  onDraw,
}: Props) => {
  const theme = useTheme()
  const zoomScope = useMemo(() => ({ bufferId, cellId }), [bufferId, cellId])
  // The option's content, so a save that leaves it unchanged (a new object
  // with the same JSON) keeps the chart's zoom.
  const optionKey = useMemo(() => JSON.stringify(rawOption), [rawOption])
  // An edited option opens on its own zoom windows, as a new chart would.
  const drawnKey = useRef(optionKey)
  useLayoutEffect(() => {
    if (drawnKey.current === optionKey) return
    drawnKey.current = optionKey
    resetChartZoom(zoomScope, { localOnly: true })
  }, [optionKey, zoomScope])
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
    }),
    [events],
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
  const option = useMemo(
    () => withBrush(built.option as EChartsOption, interactions),
    [built, interactions],
  )
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
        zoomScope={zoomScope}
        zoomable={false}
        fit
        events={chartEvents}
        onInstance={onInstance}
        onDraw={onDraw}
      />
    </>
  )
}
