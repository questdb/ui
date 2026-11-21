import React, { useEffect, useMemo, useState } from "react"
import type { EChartsOption } from "echarts"
import styled, { useTheme } from "styled-components"
import type { NotebookChartType } from "../../../../store/notebook"
import {
  ChartRenderer,
  type ChartEventHandler,
} from "../CellChart/ChartRenderer"
import type { StatementRows } from "../visuals/statementRows"
import { setRenderReport, type RenderProblem } from "../renderReports"
import { sanitizeOption } from "./sanitizeOption"
import { buildCustomOption, customSeriesCount } from "./buildCustomOption"
import { drawErrorsOf, resolveChartTypes } from "./chartTypeRegistry"
import { MAP_NAMES, ensureMaps, isMapLoaded, mapsUsedBy } from "./maps"
import { problemsOf } from "./prepareCustomOption"
import { PaneEmptyState } from "../PaneEmptyState"
import { chartTypesUsedBy } from "./chartTypeUsage"

const MAPS = new Set<string>(MAP_NAMES)

const NO_ZOOM_WINDOW = { start: 0, end: 100 }

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
  events,
  onInstance,
}: Props) => {
  const theme = useTheme()
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
  }, [bufferId, cellId, rawOption, sanitized, built, resolution, statements])

  const fatal = [...sanitized.problems, ...built.problems].find(
    (problem) => problem.severity === "error" && problem.path === "",
  )
  if (fatal)
    return <PaneEmptyState role="alert">{fatal.message}</PaneEmptyState>
  if (mapStatus === "error")
    return (
      <PaneEmptyState role="alert">
        Could not load the world map. Reload the console to try again.
      </PaneEmptyState>
    )
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

  return (
    <ChartRenderer
      option={built.option as EChartsOption}
      isFocused={isFocused}
      animate={!live}
      zoomWindow={NO_ZOOM_WINDOW}
      zoomable={false}
      fit
      specKey={specKey}
      events={events}
      onInstance={onInstance}
    />
  )
}
