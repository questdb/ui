import React, { useCallback, useEffect, useMemo } from "react"
import styled, { useTheme } from "styled-components"
import type { VisualConfig } from "../CellChart/chartTypes"
import type { CellInteractions } from "../../../../store/notebook"
import type { ColumnFormats } from "../../../../utils/formats/columnFormat"
import {
  ChartRenderer,
  type ChartEventHandler,
} from "../CellChart/ChartRenderer"
import { setRenderReport } from "../renderReports"
import { PaneEmptyState } from "../PaneEmptyState"
import type { SetVariables } from "../interactions/chartInteractions"
import {
  boundColumnProblem,
  pickLiteral,
  type Pick,
} from "../interactions/selection"
import type { StatementRows } from "./statementRows"
import {
  chordOption,
  gaugeOption,
  graphOption,
  footprintOption,
  liquidityHeatmapOption,
  mapOption,
  sankeyOption,
  stateTimelineOption,
  sunburstOption,
  treemapOption,
  volumeProfileOption,
  type VisualBuild,
  type VisualContext,
} from "./visualOptions"
import { OrderBook, orderBookDrawn } from "./OrderBook"
import { StatTiles, statTiles, statTileLimitNotice } from "./StatTiles"
import { Bullets, bulletRows } from "./Bullets"
import { PlanTree, parsePlan, planLines } from "./PlanTree"
import { UptimeBars } from "./UptimeBars"
import { readStateSegments } from "./stateSegments"
import { MAP_NAMES, ensureMaps, isMapLoaded } from "../customChart/maps"

const ECHARTS_VISUALS: Partial<
  Record<VisualConfig["type"], (ctx: VisualContext) => VisualBuild>
> = {
  gauge: gaugeOption,
  stateTimeline: stateTimelineOption,
  treemap: treemapOption,
  sunburst: sunburstOption,
  graph: graphOption,
  sankey: sankeyOption,
  chord: chordOption,
  map: mapOption,
  liquidityHeatmap: liquidityHeatmapOption,
  volumeProfile: volumeProfileOption,
  footprint: footprintOption,
}

// Visuals a click on which sets nothing.
const UNCLICKABLE_VISUALS: ReadonlySet<VisualConfig["type"]> = new Set([
  "bullet",
  "planTree",
])

// The statements a visual's clickable items are drawn from: the first, and
// the bids of an order book or the price line of a liquidity heatmap.
const clickedStatements = (
  type: VisualConfig["type"],
  statements: (StatementRows | null)[],
) =>
  type === "orderBook" || type === "liquidityHeatmap"
    ? statements.slice(0, 2)
    : statements.slice(0, 1)

const NO_ZOOM_WINDOW = { start: 0, end: 100 }

const Fill = styled.div`
  height: 100%;
  min-height: 0;
`

const MAP_LOAD_FAILED =
  "Could not load the world map. Reload the console to try again."

const useWorldMap = (needed: boolean) => {
  const [status, setStatus] = React.useState<"ready" | "loading" | "error">(
    () => (!needed || isMapLoaded(MAP_NAMES[0]) ? "ready" : "loading"),
  )
  useEffect(() => {
    if (!needed || isMapLoaded(MAP_NAMES[0])) {
      setStatus("ready")
      return
    }
    setStatus("loading")
    let cancelled = false
    void ensureMaps([MAP_NAMES[0]]).then(
      () => !cancelled && setStatus("ready"),
      () => !cancelled && setStatus("error"),
    )
    return () => {
      cancelled = true
    }
  }, [needed])
  return status
}

type Props = {
  bufferId: number
  cellId: string
  visual: VisualConfig
  statements: (StatementRows | null)[]
  statementErrors?: (string | null)[]
  formats: ColumnFormats
  interactions: CellInteractions | undefined
  clickVariableValue?: string
  queriesKey?: string
  setVariables: SetVariables
  live: boolean
  isFocused: boolean
  events?: Record<string, ChartEventHandler>
  onInstance?: React.ComponentProps<typeof ChartRenderer>["onInstance"]
}

/** Draws a cell's visual (stat tiles, order book, gauge, …) from its statements. */
export const VisualCanvas = ({
  bufferId,
  cellId,
  visual,
  statements,
  statementErrors,
  formats,
  interactions,
  clickVariableValue,
  queriesKey,
  setVariables,
  live,
  isFocused,
  events,
  onInstance,
}: Props) => {
  const theme = useTheme()
  const builder = ECHARTS_VISUALS[visual.type]
  const mapStatus = useWorldMap(visual.type === "map")
  const click = interactions?.click
  // A map fits its view to the regions once the world map has loaded.
  const built = useMemo(
    () =>
      builder && mapStatus === "ready"
        ? builder({
            visual,
            statements,
            colors: theme.color,
            formats,
          })
        : null,
    [builder, visual, statements, theme.color, formats, mapStatus],
  )
  // What a click on an item of an HTML visual writes, and the click.
  const clickColumn = click?.column
  const literalOf = useCallback(
    (pick: Pick) => pickLiteral(pick, clickColumn, statements),
    [clickColumn, statements],
  )
  const select = click
    ? (pick: Pick) => {
        const literal = literalOf(pick)
        if (literal !== undefined) setVariables({ [click.variable]: literal })
      }
    : undefined
  const pickable = click ? literalOf : undefined

  // Every visual but the order book (which reports each side) draws from the
  // first statement, so its failure is the visual's failure, not "no rows".
  const primaryError =
    visual.type === "orderBook" ? null : (statementErrors?.[0] ?? null)
  const primaryFailure =
    primaryError === null ? null : `Query failed: ${primaryError}`

  // What was drawn, for the agent.
  useEffect(() => {
    let drawn: Record<string, number | string | boolean> = {}
    let problems: { message: string; severity: "error" | "warning" }[] = []
    if (primaryFailure) {
      problems = [{ message: primaryFailure, severity: "error" }]
    } else if (mapStatus === "error") {
      problems = [{ message: MAP_LOAD_FAILED, severity: "error" }]
    } else if (built) {
      drawn = built.drawn
      problems = built.problems
    } else if (visual.type === "orderBook") {
      ;({ drawn, problems } = orderBookDrawn(
        statements,
        visual.columns,
        statementErrors,
      ))
    } else if (visual.type === "stat") {
      const read = statTiles(visual, statements)
      drawn = { tiles: read.tiles.length }
      problems = read.problems.map((message) => ({
        message,
        severity: "error",
      }))
      const limitNotice = statTileLimitNotice(statements)
      if (limitNotice)
        problems.push({ message: limitNotice, severity: "warning" })
    } else if (visual.type === "bullet") {
      const read = bulletRows(visual, statements[0])
      if ("error" in read)
        problems = [{ message: read.error ?? "", severity: "error" }]
      else drawn = { bars: read.rows.rows.length, targets: read.targetIdx >= 0 }
    } else if (visual.type === "uptime") {
      const read = readStateSegments(visual, statements[0])
      if (typeof read === "string")
        problems = [{ message: read, severity: "error" }]
      else
        drawn = {
          lanes: read.lanes.length,
          states: read.states.length,
          segments: read.segments.length,
          buckets: visual.buckets ?? 90,
        }
    } else if (visual.type === "planTree") {
      const nodes = parsePlan(planLines(visual, statements[0]))
      drawn = { operators: nodes.length }
      if (nodes.length === 0)
        problems = [
          {
            message: "No plan lines: run EXPLAIN <query> in the cell.",
            severity: "error",
          },
        ]
    }
    // A click bound to a column no statement returns writes nothing.
    const clickProblem = UNCLICKABLE_VISUALS.has(visual.type)
      ? undefined
      : boundColumnProblem(
          clickColumn,
          clickedStatements(visual.type, statements),
        )
    if (clickProblem && !primaryFailure)
      problems = [...problems, { message: clickProblem, severity: "error" }]
    setRenderReport(bufferId, cellId, {
      kind: "visual",
      visualConfig: visual,
      drawn: { type: visual.type, ...drawn },
      problems,
    })
  }, [
    bufferId,
    cellId,
    built,
    visual,
    statements,
    statementErrors,
    primaryFailure,
    mapStatus,
    clickColumn,
  ])

  if (primaryFailure)
    return <PaneEmptyState role="alert">{primaryFailure}</PaneEmptyState>
  switch (visual.type) {
    case "stat":
      return (
        <StatTiles
          visual={visual}
          statements={statements}
          formats={formats}
          queriesKey={queriesKey}
          selectedValue={click ? clickVariableValue : undefined}
          pickLiteral={pickable}
          onSelect={select}
        />
      )
    case "orderBook":
      return (
        <OrderBook
          statements={statements}
          statementErrors={statementErrors}
          columns={visual.columns}
          formats={formats}
          animateDigits={visual.animateDigits}
          queriesKey={queriesKey}
          pickLiteral={pickable}
          onSelect={select}
        />
      )
    case "bullet":
      return (
        <Bullets visual={visual} statements={statements} formats={formats} />
      )
    case "planTree":
      return <PlanTree visual={visual} statements={statements} />
    case "uptime":
      return (
        <UptimeBars
          visual={visual}
          statements={statements}
          pickLiteral={pickable}
          onSelect={select}
        />
      )
    default:
      break
  }
  if (mapStatus === "error")
    return <PaneEmptyState role="alert">{MAP_LOAD_FAILED}</PaneEmptyState>
  if (mapStatus === "loading")
    return <PaneEmptyState>Loading map…</PaneEmptyState>
  if (!built?.option)
    return (
      <PaneEmptyState>
        {built?.problems[0]?.message ?? "Nothing to draw."}
      </PaneEmptyState>
    )
  return (
    <Fill>
      <ChartRenderer
        option={built.option}
        isFocused={isFocused}
        animate={!live}
        zoomWindow={NO_ZOOM_WINDOW}
        zoomable={false}
        fit
        specKey={`visual:${visual.type}:${JSON.stringify(visual.columns ?? {})}`}
        events={events}
        onInstance={onInstance}
      />
    </Fill>
  )
}
