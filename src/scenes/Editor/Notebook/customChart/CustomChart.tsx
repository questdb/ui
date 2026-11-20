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
import { buildCustomOption } from "./buildCustomOption"
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
  const specKey = useMemo(
    () =>
      JSON.stringify(rawOption).length.toString(36) +
      ":" +
      JSON.stringify(sanitized.option).slice(0, 200),
    [rawOption, sanitized],
  )

  const neededMaps = useMemo(() => mapsUsedBy(built.option), [built])
  const [mapsReady, setMapsReady] = useState(() =>
    neededMaps.every(isMapLoaded),
  )
  useEffect(() => {
    if (neededMaps.every(isMapLoaded)) {
      setMapsReady(true)
      return
    }
    setMapsReady(false)
    let cancelled = false
    void ensureMaps(neededMaps).then(
      () => !cancelled && setMapsReady(true),
      () => undefined,
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
      const series = Array.isArray(built.option.series)
        ? built.option.series.length
        : 0
      setRenderReport(bufferId, cellId, {
        kind: "custom",
        drawn: {
          series,
          datasets: statements.length,
          rows: statements.reduce((n, s) => n + (s?.rows.length ?? 0), 0),
        },
        problems,
      })
    }, 50)
    return () => window.clearTimeout(timer)
  }, [bufferId, cellId, rawOption, sanitized, built, resolution, statements])

  if (sanitized.problems.some((p) => p.severity === "error" && p.path === ""))
    return <PaneEmptyState>{sanitized.problems[0].message}</PaneEmptyState>
  if (!mapsReady) return <PaneEmptyState>Loading map…</PaneEmptyState>
  // A chart type whose code is not allowed draws nothing: say why.
  const waiting = chartTypesUsedBy(rawOption).filter(
    (name) =>
      chartTypes?.some((t) => t.name === name && t.allowed !== true) ?? false,
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
