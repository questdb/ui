import type { EChartsOption } from "echarts"
import type { ColorShape } from "../../../../types/styled"
import type { ColumnFormats } from "../../../../utils/formats/columnFormat"
import type { VisualConfig } from "../CellChart/chartTypes"
import type { RenderProblem } from "../renderReports"
import { boundColumnProblem } from "../interactions/selection"
import {
  LOADING_MAP,
  MAP_LOAD_FAILED,
  NO_ROWS,
  drawnOutcome,
  notDrawn,
  queryFailed,
  withLeftOutStatements,
  type DrawOutcome,
} from "../drawOutcome"
import type { StatementRows } from "./statementRows"
import { incompleteResultProblem } from "./visualCatalog"
import {
  chordOption,
  footprintOption,
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
import { orderBookDrawn, orderBookRead, type OrderBookRead } from "./OrderBook"
import { statTiles, type StatTilesRead } from "./StatTiles"
import { bulletRows, type BulletRows } from "./Bullets"
import { parsePlan, planLines, type PlanNode } from "./PlanTree"
import { readStateSegments, type StateSegments } from "./stateSegments"

// What a visual shows, decided once from its statements: the outcome the
// pane renders and the report carries, and what the pane draws (an ECharts
// option, or the rows an HTML component was read into). The components draw
// the read they are given; they do not read the rows again.

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

/** What a visual's pane draws once it is drawn. */
export type VisualRead =
  | { kind: "echarts"; option: EChartsOption }
  | { kind: "stat"; read: StatTilesRead }
  | { kind: "bullet"; read: BulletRows }
  | { kind: "uptime"; read: StateSegments }
  | { kind: "planTree"; tree: PlanNode[] }
  | { kind: "orderBook"; read: OrderBookRead }

export type VisualDraw = { outcome: DrawOutcome; read: VisualRead | null }

export type VisualDrawInput = {
  visual: VisualConfig
  statements: (StatementRows | null)[]
  statementErrors?: (string | null)[]
  // The world map a map visual draws on.
  mapStatus: "ready" | "loading" | "error"
  colors: ColorShape
  formats: ColumnFormats
  // The column a click writes, when bound.
  clickColumn?: string
}

const error = (message: string): RenderProblem => ({
  message,
  severity: "error",
})

// An order book reports each side: a side's failure or problem shows in its
// half of the ladder while the other side draws.
const orderBookDraw = (
  { visual, statements, statementErrors }: VisualDrawInput,
  drawn: DrawOutcome["drawn"],
): VisualDraw => {
  const read = orderBookRead(statements, visual.columns)
  const report = orderBookDrawn(read, statements.length, statementErrors)
  const problems = report.problems
  if (read.asks.levels.length + read.bids.levels.length > 0)
    return {
      outcome: drawnOutcome({ ...drawn, ...report.drawn }, problems),
      read: { kind: "orderBook", read },
    }
  // Nothing on either side: a failed side, then a side that cannot be read,
  // then no rows.
  const failed = problems.find((p) => / query failed: /.test(p.message))
  const lead = failed ?? problems.find((p) => p.severity === "error")
  if (!lead)
    return { outcome: notDrawn("empty", NO_ROWS, { drawn }), read: null }
  return {
    outcome: notDrawn(failed ? "failed" : "refused", lead.message, {
      drawn,
      first: lead,
      rest: problems.filter((p) => p !== lead),
    }),
    read: null,
  }
}

const readVisual = (
  input: VisualDrawInput,
  drawn: DrawOutcome["drawn"],
): VisualDraw => {
  const { visual, statements, colors, formats } = input
  const rows = statements[0] ?? null
  const builder = ECHARTS_VISUALS[visual.type]
  if (builder) {
    const build = builder({ visual, statements, colors, formats })
    if (!build.option) {
      const lead = build.problems[0] ?? error("Nothing to draw.")
      return {
        outcome: notDrawn("refused", lead.message, {
          drawn: { ...drawn, ...build.drawn },
          first: lead,
          rest: build.problems.slice(1),
        }),
        read: null,
      }
    }
    return {
      outcome: drawnOutcome({ ...drawn, ...build.drawn }, build.problems),
      read: { kind: "echarts", option: build.option },
    }
  }
  switch (visual.type) {
    case "stat": {
      const read = statTiles(visual, statements)
      const problems = read.problems.map(error)
      if (read.tiles.length === 0)
        return {
          outcome: notDrawn("refused", problems[0]?.message ?? NO_ROWS, {
            drawn,
            rest: problems.slice(1),
          }),
          read: null,
        }
      if (read.limitNotice)
        problems.push({ message: read.limitNotice, severity: "warning" })
      return {
        outcome: drawnOutcome({ ...drawn, tiles: read.tiles.length }, problems),
        read: { kind: "stat", read },
      }
    }
    case "bullet": {
      const read = bulletRows(visual, rows)
      if ("error" in read)
        return {
          outcome: notDrawn("refused", read.error, { drawn }),
          read: null,
        }
      return {
        outcome: drawnOutcome(
          {
            ...drawn,
            bars: read.rows.rows.length,
            targets: read.targetIdx >= 0,
          },
          [],
        ),
        read: { kind: "bullet", read },
      }
    }
    case "uptime": {
      const read = readStateSegments(visual, rows)
      if (typeof read === "string")
        return { outcome: notDrawn("refused", read, { drawn }), read: null }
      return {
        outcome: drawnOutcome(
          {
            ...drawn,
            lanes: read.lanes.length,
            states: read.states.length,
            segments: read.segments.length,
            buckets: visual.buckets ?? 90,
          },
          [],
        ),
        read: { kind: "uptime", read },
      }
    }
    case "planTree": {
      const tree = parsePlan(planLines(visual, rows))
      if (tree.length === 0)
        return {
          outcome: notDrawn(
            "refused",
            "No plan lines: run EXPLAIN <query> in the cell.",
            { drawn: { ...drawn, operators: 0 } },
          ),
          read: null,
        }
      return {
        outcome: drawnOutcome({ ...drawn, operators: tree.length }, []),
        read: { kind: "planTree", tree },
      }
    }
    default:
      return {
        outcome: notDrawn("refused", "Nothing to draw.", { drawn }),
        read: null,
      }
  }
}

/**
 * What a visual shows from its statements, and what its pane draws. Every
 * visual but the order book (which reports each side) draws from the first
 * statement, so that statement's failure is the visual's failure, not "no
 * rows"; a visual that needs every row is not drawn from a row-capped result.
 */
export const visualDraw = (input: VisualDrawInput): VisualDraw => {
  const drawn = drawVisual(input)
  // Statement 0 is the visual's own (its failure is the visual's); the order
  // book reports each side itself.
  return {
    ...drawn,
    outcome: withLeftOutStatements(
      drawn.outcome,
      input.statementErrors,
      (index) => index === 0 || input.visual.type === "orderBook",
    ),
  }
}

const drawVisual = (input: VisualDrawInput): VisualDraw => {
  const { visual, statements, statementErrors, mapStatus, clickColumn } = input
  const typed = { type: visual.type }
  const primaryError =
    visual.type === "orderBook" ? null : (statementErrors?.[0] ?? null)
  if (primaryError !== null)
    return {
      outcome: notDrawn("failed", queryFailed(primaryError), { drawn: typed }),
      read: null,
    }
  const incomplete = incompleteResultProblem(visual, statements)
  let draw: VisualDraw
  if (incomplete) {
    draw = {
      outcome: notDrawn("refused", incomplete, { drawn: typed }),
      read: null,
    }
  } else if (mapStatus === "error") {
    return {
      outcome: notDrawn("failed", MAP_LOAD_FAILED, { drawn: typed }),
      read: null,
    }
  } else if (mapStatus === "loading") {
    return {
      outcome: notDrawn("waiting", LOADING_MAP, { drawn: typed }),
      read: null,
    }
  } else if (visual.type === "orderBook") {
    draw = orderBookDraw(input, typed)
  } else if (!statements[0] || statements[0].rows.length === 0) {
    draw = { outcome: notDrawn("empty", NO_ROWS, { drawn: typed }), read: null }
  } else {
    draw = readVisual(input, typed)
  }
  // A click bound to a column no statement returns writes nothing.
  const clickProblem = UNCLICKABLE_VISUALS.has(visual.type)
    ? undefined
    : boundColumnProblem(
        clickColumn,
        clickedStatements(visual.type, statements),
      )
  if (!clickProblem || incomplete || draw.outcome.status === "failed")
    return draw
  const problems = [...draw.outcome.problems, error(clickProblem)]
  return {
    ...draw,
    outcome: {
      ...draw.outcome,
      problems,
      message: draw.outcome.message ?? clickProblem,
    },
  }
}
