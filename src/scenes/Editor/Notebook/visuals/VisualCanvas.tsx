import React, { useEffect, useMemo } from "react"
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
import {
  sqlLiteral,
  type SetVariables,
} from "../interactions/chartInteractions"
import type { StatementRows } from "./statementRows"
import {
  chordOption,
  gaugeOption,
  graphOption,
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
import { StatTiles, statTiles } from "./StatTiles"
import { Bullets, bulletRows } from "./Bullets"
import { PlanTree, parsePlan, planLines } from "./PlanTree"
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
}

const NO_ZOOM_WINDOW = { start: 0, end: 100 }

const Fill = styled.div`
  height: 100%;
  min-height: 0;
`

const useWorldMap = (needed: boolean) => {
  const [ready, setReady] = React.useState(
    () => !needed || isMapLoaded(MAP_NAMES[0]),
  )
  useEffect(() => {
    if (!needed || isMapLoaded(MAP_NAMES[0])) {
      setReady(true)
      return
    }
    let cancelled = false
    void ensureMaps([MAP_NAMES[0]]).then(
      () => !cancelled && setReady(true),
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [needed])
  return ready
}

type Props = {
  bufferId: number
  cellId: string
  visual: VisualConfig
  statements: (StatementRows | null)[]
  formats: ColumnFormats
  interactions: CellInteractions | undefined
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
  formats,
  interactions,
  setVariables,
  live,
  isFocused,
  events,
  onInstance,
}: Props) => {
  const theme = useTheme()
  const builder = ECHARTS_VISUALS[visual.type]
  const built = useMemo(
    () =>
      builder
        ? builder({ visual, statements, colors: theme.color, formats })
        : null,
    [builder, visual, statements, theme.color, formats],
  )
  const mapReady = useWorldMap(visual.type === "map")
  const click = interactions?.click
  const select = click
    ? (value: unknown) => setVariables({ [click.variable]: sqlLiteral(value) })
    : undefined

  // What was drawn, for the agent.
  useEffect(() => {
    let drawn: Record<string, number | string | boolean> = {}
    let problems: { message: string; severity: "error" | "warning" }[] = []
    if (built) {
      drawn = built.drawn
      problems = built.problems
    } else if (visual.type === "orderBook") {
      ;({ drawn, problems } = orderBookDrawn(statements, visual.columns))
    } else if (visual.type === "stat") {
      const read = statTiles(visual, statements)
      drawn = { tiles: read.tiles.length }
      problems = read.problems.map((message) => ({
        message,
        severity: "error",
      }))
    } else if (visual.type === "bullet") {
      const read = bulletRows(visual, statements[0])
      if ("error" in read)
        problems = [{ message: read.error ?? "", severity: "error" }]
      else drawn = { bars: read.rows.rows.length, targets: read.targetIdx >= 0 }
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
    setRenderReport(bufferId, cellId, {
      kind: "visual",
      drawn: { type: visual.type, ...drawn },
      problems,
    })
  }, [bufferId, cellId, built, visual, statements])

  switch (visual.type) {
    case "stat":
      return (
        <StatTiles
          visual={visual}
          statements={statements}
          formats={formats}
          onSelect={select}
        />
      )
    case "orderBook":
      return (
        <OrderBook
          statements={statements}
          columns={visual.columns}
          formats={formats}
          onSelect={select}
        />
      )
    case "bullet":
      return (
        <Bullets visual={visual} statements={statements} formats={formats} />
      )
    case "planTree":
      return <PlanTree visual={visual} statements={statements} />
    default:
      break
  }
  if (!built?.option)
    return (
      <PaneEmptyState>
        {built?.problems[0]?.message ?? "Nothing to draw."}
      </PaneEmptyState>
    )
  if (!mapReady) return <PaneEmptyState>Loading map…</PaneEmptyState>
  return (
    <Fill>
      <ChartRenderer
        option={built.option}
        isFocused={isFocused}
        animate={!live}
        zoomWindow={NO_ZOOM_WINDOW}
        zoomable={false}
        specKey={`visual:${visual.type}:${JSON.stringify(visual.columns ?? {})}`}
        events={events}
        onInstance={onInstance}
      />
    </Fill>
  )
}
