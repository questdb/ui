import type { CustomSeriesRenderItem, EChartsOption } from "echarts"
import { escapeHtml } from "../../../../utils/escapeHtml"
import type { ColorShape } from "../../../../types/styled"
import type { VisualConfig } from "../CellChart/chartTypes"
import { echarts } from "../CellChart/echartsSetup"
import { classifyColumn } from "../CellChart/inferChartConfig"
import { withAlpha } from "../../../../theme"
import {
  formatValue,
  thresholdBands,
  toneColor,
  toneOf,
  type ColumnFormats,
} from "../../../../utils/formats/columnFormat"
import { SEVERITY_RANK, readStateSegments, severityOf } from "./stateSegments"
import {
  MAX_SANKEY_LINKS,
  SANKEY_LINK_LIMIT_MESSAGE,
} from "./sankeyLayoutLimit"
import { pickOf, type Pick as MarkPick } from "../interactions/selection"
import {
  columnIndex,
  firstColumnOf,
  linksFrom,
  nodesFrom,
  toLabel,
  toNumber,
  toTime,
  treeFromPath,
  type StatementRows,
  type TreeNode,
} from "./statementRows"

// Visuals drawn with ECharts: each builds an option from the cell's statements,
// in the console's style, and reports what it drew or what it could not find.
// Columns map by role; every role falls back to a column by position or kind,
// so a query that returns the documented column order needs no mapping.
// Clickable items carry the statement rows they are drawn from (a `pick`,
// see selection.ts).

export type VisualProblem = { message: string; severity: "error" | "warning" }

export type VisualBuild = {
  option: EChartsOption | null
  drawn: Record<string, number | string | boolean>
  problems: VisualProblem[]
}

export type VisualContext = {
  visual: VisualConfig
  statements: (StatementRows | null)[]
  colors: ColorShape
  formats: ColumnFormats
}

const missing = (message: string): VisualBuild => ({
  option: null,
  drawn: {},
  problems: [{ message, severity: "error" }],
})

const palette = (colors: ColorShape): string[] => [
  colors.chartSeries1,
  colors.chartSeries2,
  colors.chartSeries3,
  colors.chartSeries4,
  colors.chartSeries5,
  colors.chartSeries6,
  colors.chartSeries7,
  colors.chartSeries8,
]

const columnNames = (rows: StatementRows) =>
  rows.columns.map((c) => c.name).join(", ")

const need = (
  rows: StatementRows,
  index: number,
  role: string,
  name: string | undefined,
): string | null =>
  index >= 0
    ? null
    : `${role}: column ${name ? JSON.stringify(name) : "(by position)"} not found. Columns: ${columnNames(rows)}.`

// ── Gauge ─────────────────────────────────────────────────────────────────

export const gaugeOption = ({
  visual,
  statements,
  colors,
  formats,
}: VisualContext): VisualBuild => {
  const rows = statements[0]
  if (!rows || rows.rows.length === 0)
    return missing("The query returned no rows.")
  const valueColumn = visual.columns?.value
  const valueIdx =
    valueColumn === undefined
      ? firstColumnOf(rows, "numeric")
      : columnIndex(rows, valueColumn)
  const err = need(rows, valueIdx, "value", visual.columns?.value)
  if (err) return missing(err)
  const valueName = rows.columns[valueIdx].name
  const format = formats[valueName]
  const rawValue = rows.rows[0][valueIdx]
  const value = toNumber(rawValue)
  if (value === null)
    return missing(
      `No numeric value for ${JSON.stringify(valueName)} in the first row.`,
    )
  const labelIdx = columnIndex(rows, visual.columns?.label)
  const min = visual.min ?? 0
  const max =
    visual.max ?? (format?.kind === "percent" ? 1 : Math.max(100, value))
  if (min >= max)
    return missing("Gauge maximum must be greater than its minimum.")
  const span = max - min
  const clamped = Math.min(Math.max(value, min), max)
  const tone = toneOf(rawValue, format)
  const valueColor = tone ? toneColor(tone, colors) : colors.chartSeries1
  // Threshold zones: a thin outer ring, quiet below the value's own colour.
  const bands = thresholdBands(format, min, max)
  const zones: [number, string][] =
    bands.length > 0
      ? bands.map((b) => [
          (b.to - min) / span,
          withAlpha(toneColor(b.tone, colors), 0.55),
        ])
      : [[1, colors.dataGrid]]
  const label = labelIdx >= 0 ? toLabel(rows.rows[0][labelIdx]) : valueName
  // The reading is drawn from the first row: named by its label column.
  const datum = { value: clamped, name: label, pick: pickOf(0, [0], labelIdx) }
  const plain = format ? { ...format, prefix: "", suffix: "" } : undefined
  const common = {
    type: "gauge" as const,
    min,
    max,
    startAngle: 220,
    endAngle: -40,
    center: ["50%", "56%"],
    splitNumber: 1,
    axisTick: { show: false },
    splitLine: { show: false },
  }
  return {
    option: {
      series: [
        {
          // The zones, as a thin ring outside the track.
          ...common,
          radius: "94%",
          axisLine: { lineStyle: { width: 3, color: zones } },
          axisLabel: { show: false },
          pointer: { show: false },
          progress: { show: false },
          detail: { show: false },
          title: { show: false },
          data: [{ value: clamped }],
          silent: true,
        },
        {
          ...common,
          radius: "86%",
          axisLine: {
            roundCap: true,
            lineStyle: { width: 14, color: [[1, colors.dataGrid]] },
          },
          progress: {
            show: true,
            roundCap: true,
            width: 14,
            itemStyle: { color: valueColor },
          },
          pointer: { show: false },
          anchor: { show: false },
          // Only the ends are labelled.
          axisLabel: {
            distance: -34,
            color: colors.contentSecondary,
            fontSize: 12,
            formatter: (v: number) =>
              v === min || v === max ? formatValue(v, plain) : "",
          },
          title: {
            show: labelIdx >= 0,
            offsetCenter: [0, "34%"],
            color: colors.contentSecondary,
            fontSize: 13,
          },
          detail: {
            offsetCenter: [0, "2%"],
            valueAnimation: true,
            fontSize: 30,
            fontWeight: 600,
            color: colors.contentPrimary,
            formatter: () => formatValue(rawValue, format),
          },
          data: [datum],
        },
      ],
    },
    drawn: {
      value: typeof rawValue === "string" ? rawValue : value,
      min,
      max,
      bands: bands.length,
    },
    problems:
      value < min || value > max
        ? [
            {
              message: `The value is outside min ${min} … max ${max}; set min and max on the visual.`,
              severity: "warning",
            },
          ]
        : [],
  }
}

// ── State timeline ───────────────────────────────────────────────────────

const STATE_TIMELINE = "qdbStateTimeline"

const stateTimelineRenderItem: CustomSeriesRenderItem = (params, api) => {
  const lane = api.value(2)
  const start = api.coord([api.value(0), lane])
  const end = api.coord([api.value(1), lane])
  const height = Math.min((api.size?.([0, 1]) as number[])[1] * 0.56, 22)
  // A hairline gap between consecutive states keeps their edges visible.
  const x = start[0] + 1
  const width = Math.max(end[0] - start[0] - 2, 1)
  const coordSys = params.coordSys as unknown as {
    x: number
    y: number
    width: number
    height: number
  }
  const rect = echarts.graphic.clipRectByRect(
    { x, y: start[1] - height / 2, width, height },
    coordSys,
  )
  return (
    rect && {
      type: "rect",
      transition: ["shape"],
      shape: { ...rect, r: 2 },
      style: { fill: api.visual("color") as string },
    }
  )
}

echarts.registerCustomSeries(STATE_TIMELINE, stateTimelineRenderItem)

export const stateTimelineOption = ({
  visual,
  statements,
  colors,
}: VisualContext): VisualBuild => {
  const read = readStateSegments(visual, statements[0])
  if (typeof read === "string") return missing(read)
  const { lanes, segments: segs } = read
  const severity = (state: string) =>
    SEVERITY_RANK[severityOf(state, visual.severity)]
  // Good states first, then the rest, then warnings, then failures, so the
  // legend reads in order of severity.
  const states = [...read.states].sort(
    (a, b) => severity(a) - severity(b) || a.localeCompare(b),
  )
  const neutral = [
    colors.chartSeries1,
    colors.chartSeries4,
    colors.chartSeries3,
    colors.chartSeries6,
    colors.chartSeries5,
  ]
  let nextNeutral = 0
  const stateColors = new Map(
    states.map((state) => {
      const level = severity(state)
      const color =
        level === 0
          ? colors.chartUp
          : level === 2
            ? colors.statusWarning
            : level === 3
              ? colors.chartDown
              : neutral[nextNeutral++ % neutral.length]
      return [state, color]
    }),
  )
  const laneIndex = new Map(lanes.map((lane, index) => [lane, index]))
  const stateIndex = new Map(states.map((state, index) => [state, index]))
  type Item = { value: number[]; pick: MarkPick }
  const seriesData = states.map((): Item[] => [])
  for (const segment of segs) {
    const lane = laneIndex.get(segment.lane)
    const state = stateIndex.get(segment.state)
    if (lane === undefined || state === undefined) continue
    // A segment is drawn from its row, in its lane.
    seriesData[state].push({
      value: [segment.start, segment.end, lane, state],
      pick: pickOf(0, [segment.row], read.laneColumn),
    })
  }
  const clock = (ms: number) => new Date(ms).toISOString().slice(11, 16)
  return {
    option: {
      useUTC: true,
      tooltip: {
        formatter: (p: unknown) => {
          const v = (p as { value: [number, number, number, number] }).value
          const s = states[v[3]]
          const minutes = Math.round((v[1] - v[0]) / 60000)
          return `${escapeHtml(lanes[v[2]] ?? "")}<br/><b>${escapeHtml(s)}</b><br/>${clock(v[0])}–${clock(v[1])} · ${minutes} min`
        },
      },
      grid: { left: 12, right: 24, top: 12, bottom: 36, containLabel: true },
      xAxis: { type: "time" },
      yAxis: {
        type: "category",
        data: lanes,
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { show: false },
        splitArea: { show: true },
      },
      legend: { bottom: 0, data: states },
      series: states.map((state, index) => ({
        type: "custom",
        name: state,
        renderItem: STATE_TIMELINE,
        encode: { x: [0, 1], y: 2 },
        itemStyle: { color: stateColors.get(state) },
        data: seriesData[index],
      })) as EChartsOption["series"],
    },
    drawn: {
      lanes: lanes.length,
      states: states.length,
      segments: segs.length,
    },
    problems: [],
  }
}

// ── Treemap and sunburst ─────────────────────────────────────────────────

const hierarchy = (
  ctx: VisualContext,
): { tree: TreeNode[]; valueName: string; colorName?: string } | string => {
  const rows = ctx.statements[0]
  if (!rows || rows.rows.length === 0) return "The query returned no rows."
  const c = ctx.visual.columns ?? {}
  const pathIdx = c.path
    ? c.path.map((p) => columnIndex(rows, p))
    : rows.columns.flatMap((col, i) =>
        classifyColumn(col) === "categorical" ? [i] : [],
      )
  if (pathIdx.length === 0 || pathIdx.some((i) => i < 0))
    return `path: columns ${JSON.stringify(c.path ?? [])} not found. Columns: ${columnNames(rows)}.`
  const valueIdx =
    c.value !== undefined
      ? columnIndex(rows, c.value)
      : firstColumnOf(rows, "numeric")
  if (valueIdx < 0)
    return `value: column ${JSON.stringify(c.value)} not found. Columns: ${columnNames(rows)}.`
  const colorIdx = c.change !== undefined ? columnIndex(rows, c.change) : -1
  return {
    tree: treeFromPath(rows, pathIdx, valueIdx, colorIdx),
    valueName: rows.columns[valueIdx].name,
    colorName: colorIdx >= 0 ? rows.columns[colorIdx].name : undefined,
  }
}

// A node is drawn from the rows under it, by its level's path column.
const withColorValues = (nodes: TreeNode[]): unknown[] =>
  nodes.map((n) => ({
    name: n.name,
    value: n.colorValue !== undefined ? [n.value, n.colorValue] : n.value,
    pick: pickOf(0, n.rows, n.column),
    ...(n.children ? { children: withColorValues(n.children) } : {}),
  }))

const divergingVisualMap = (colors: ColorShape, values: number[]) => {
  const extent = Math.max(...values.map(Math.abs), 1e-9)
  return {
    show: false,
    dimension: 1,
    min: -extent,
    max: extent,
    inRange: {
      color: [
        withAlpha(colors.chartDown, 0.8),
        withAlpha(colors.chartDown, 0.35),
        colors.surfaceRaised,
        withAlpha(colors.chartUp, 0.35),
        withAlpha(colors.chartUp, 0.8),
      ],
    },
  }
}

const colorValues = (nodes: TreeNode[]): number[] =>
  nodes.flatMap((n) => [
    ...(n.colorValue !== undefined ? [n.colorValue] : []),
    ...colorValues(n.children ?? []),
  ])

export const treemapOption = (ctx: VisualContext): VisualBuild => {
  const h = hierarchy(ctx)
  if (typeof h === "string") return missing(h)
  const { colors, formats } = ctx
  const valueFormat = formats[h.valueName] ?? { compact: true }
  const colorFormat = h.colorName
    ? (formats[h.colorName] ?? { kind: "percent" as const, decimals: 1 })
    : undefined
  const changes = colorValues(h.tree)
  const diverging = changes.length > 0
  const grouped = h.tree.some((n) => n.children && n.children.length > 0)
  const esc = escapeHtml
  // Without a change column, each group takes a palette colour and its tiles
  // shade by size.
  const data = withColorValues(h.tree).map((node, i) =>
    diverging
      ? node
      : {
          ...(node as object),
          itemStyle: { color: withAlpha(palette(colors)[i % 8], 0.72) },
        },
  )
  return {
    option: {
      tooltip: {
        formatter: (p: unknown) => {
          const { name, value, treePathInfo } = p as {
            name: string
            value: number | number[]
            treePathInfo?: { name: string }[]
          }
          const [v, c] = Array.isArray(value) ? value : [value, undefined]
          const path = (treePathInfo ?? [])
            .map((t) => t.name)
            .filter(Boolean)
            .join(" › ")
          return `<b>${esc(path || name)}</b><br/>${esc(formatValue(v, valueFormat))}${
            c !== undefined && colorFormat
              ? ` · ${esc(formatValue(c, colorFormat))}`
              : ""
          }`
        },
      },
      ...(diverging ? { visualMap: divergingVisualMap(colors, changes) } : {}),
      series: [
        {
          type: "treemap",
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          top: 2,
          left: 2,
          right: 2,
          bottom: 2,
          squareRatio: 1.2,
          label: {
            show: true,
            position: "insideTopLeft",
            padding: [6, 8],
            textBorderWidth: 0,
            formatter: (p: unknown) => {
              const { name, value } = p as {
                name: string
                value: number | number[]
              }
              const [v, c] = Array.isArray(value) ? value : [value, undefined]
              const second =
                c !== undefined && colorFormat
                  ? formatValue(c, { ...colorFormat, signTone: false })
                  : formatValue(v, valueFormat)
              return `{name|${name}}\n{value|${second}}`
            },
            // Palette fills are too light for primary text in the dark
            // theme; a surface halo keeps labels legible on every tile.
            rich: {
              name: {
                fontSize: 12,
                fontWeight: 600,
                color: colors.contentPrimary,
                lineHeight: 16,
                textBorderColor: colors.surfaceInset,
                textBorderWidth: 3,
              },
              value: {
                fontSize: 11,
                color: colors.contentPrimary,
                lineHeight: 14,
                textBorderColor: colors.surfaceInset,
                textBorderWidth: 3,
              },
            },
          },
          upperLabel: {
            show: grouped,
            formatter: "{b}",
            height: 20,
            padding: [0, 8],
            color: colors.contentSecondary,
            fontSize: 11,
            fontWeight: 600,
          },
          itemStyle: {
            borderColor: colors.surfaceInset,
            borderWidth: 0,
            gapWidth: 2,
            borderRadius: 4,
          },
          levels: grouped
            ? [
                {
                  itemStyle: {
                    borderColor: colors.surfaceInset,
                    borderWidth: 3,
                    gapWidth: 3,
                    borderRadius: 4,
                  },
                },
                {
                  itemStyle: {
                    borderColor: colors.surfaceRaised,
                    borderWidth: 0,
                    gapWidth: 2,
                    borderRadius: 4,
                  },
                  ...(diverging
                    ? {}
                    : { colorAlpha: [0.35, 0.8], colorMappingBy: "value" }),
                },
                { itemStyle: { gapWidth: 2, borderRadius: 4 } },
              ]
            : [],
          ...(diverging
            ? { visualDimension: 1 }
            : grouped
              ? {}
              : { colorMappingBy: "index" }),
          data,
        },
      ] as EChartsOption["series"],
    },
    drawn: { groups: h.tree.length },
    problems: [],
  }
}

export const sunburstOption = (ctx: VisualContext): VisualBuild => {
  const h = hierarchy(ctx)
  if (typeof h === "string") return missing(h)
  const { colors, formats } = ctx
  const changes = colorValues(h.tree)
  const valueFormat = formats[h.valueName]
  return {
    option: {
      tooltip: {
        formatter: (p: unknown) => {
          const { name, value } = p as {
            name: string
            value: number | number[]
          }
          const v = Array.isArray(value) ? value[0] : value
          return `${escapeHtml(name)}<br/>${escapeHtml(formatValue(v, valueFormat))}`
        },
      },
      ...(changes.length > 0
        ? { visualMap: divergingVisualMap(colors, changes) }
        : {}),
      series: [
        {
          type: "sunburst",
          radius: ["12%", "95%"],
          sort: undefined,
          nodeClick: false,
          itemStyle: { borderColor: colors.surfaceInset, borderWidth: 1.5 },
          label: {
            color: colors.contentPrimary,
            backgroundColor: colors.surfaceInset,
            padding: [1, 3],
            borderRadius: 2,
            fontSize: 11,
            minAngle: 8,
          },
          data: withColorValues(h.tree),
        },
      ] as EChartsOption["series"],
    },
    drawn: { groups: h.tree.length },
    problems: [],
  }
}

// ── Graph, Sankey and chord ──────────────────────────────────────────────

const edges = (ctx: VisualContext) => {
  const rows = ctx.statements[0]
  if (!rows || rows.rows.length === 0) return "The query returned no rows."
  const c = ctx.visual.columns ?? {}
  const fromIdx = columnIndex(rows, c.from, 0)
  const toIdx = columnIndex(rows, c.to, 1)
  const valueIdx =
    c.value !== undefined
      ? columnIndex(rows, c.value)
      : columnIndex(rows, undefined, 2)
  const err =
    need(rows, fromIdx, "from", c.from) ??
    need(rows, toIdx, "to", c.to) ??
    (c.value === undefined ? null : need(rows, valueIdx, "value", c.value))
  if (err) return err
  // A link is drawn from its row, but from no column: an unbound click on it
  // selects nothing.
  const links = linksFrom(rows, fromIdx, toIdx, valueIdx).map(
    (link, index) => ({
      ...link,
      pick: pickOf(0, [index]),
    }),
  )
  return {
    links,
    nodes: nodesFrom(rows, 0, fromIdx, toIdx),
    valueName: valueIdx >= 0 ? rows.columns[valueIdx].name : undefined,
  }
}

// Force repulsion is quadratic in endpoint count, independent of the result
// row cap. Keep every link but choose ECharts' bounded circular layout above
// the force budget.
const MAX_FORCE_GRAPH_NODES = 500

export const graphOption = (ctx: VisualContext): VisualBuild => {
  const e = edges(ctx)
  if (typeof e === "string") return missing(e)
  const { colors, formats } = ctx
  const weight = new Map<string, number>()
  for (const l of e.links) {
    weight.set(l.source, (weight.get(l.source) ?? 0) + l.value)
    weight.set(l.target, (weight.get(l.target) ?? 0) + l.value)
  }
  const maxWeight = Math.max(...weight.values(), 1)
  const maxLink = Math.max(...e.links.map((l) => l.value), 1)
  const force = e.nodes.length <= MAX_FORCE_GRAPH_NODES
  const format = e.valueName ? formats[e.valueName] : undefined
  return {
    option: {
      tooltip: {
        formatter: (p: unknown) => {
          const { dataType, data } = p as {
            dataType: string
            data: {
              name?: string
              source?: string
              target?: string
              value?: number
            }
          }
          const esc = (t: string | undefined) => escapeHtml(t ?? "")
          return dataType === "edge"
            ? `${esc(data.source)} → ${esc(data.target)}<br/>${esc(formatValue(data.value, format))}`
            : `${esc(data.name)}<br/>${esc(formatValue(weight.get(data.name ?? ""), format))}`
        },
      },
      series: [
        {
          type: "graph",
          layout: force ? "force" : "circular",
          roam: true,
          draggable: force,
          ...(force && {
            force: { repulsion: 220, edgeLength: [60, 160], gravity: 0.08 },
          }),
          label: {
            show: force,
            position: "right",
            color: colors.contentPrimary,
            fontSize: 11,
          },
          lineStyle: {
            color: colors.borderStrong,
            curveness: 0.15,
            opacity: 0.8,
          },
          emphasis: { focus: "adjacency", lineStyle: { width: 4 } },
          edgeSymbol: ["none", "arrow"],
          edgeSymbolSize: 6,
          data: e.nodes.map((n, i) => ({
            ...n,
            symbolSize:
              10 + 26 * Math.sqrt((weight.get(n.name) ?? 0) / maxWeight),
            itemStyle: { color: palette(colors)[i % 8] },
          })),
          links: e.links.map((l) => ({
            ...l,
            lineStyle: { width: 1 + 5 * (l.value / maxLink) },
          })),
        },
      ],
    },
    drawn: { nodes: e.nodes.length, links: e.links.length },
    problems: [],
  }
}

export const sankeyOption = (ctx: VisualContext): VisualBuild => {
  const e = edges(ctx)
  if (typeof e === "string") return missing(e)
  if (e.links.length > MAX_SANKEY_LINKS)
    return missing(SANKEY_LINK_LIMIT_MESSAGE)
  // Labels sit right of their node, except on the last column, where they
  // would run off the chart.
  const depth = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  const incoming = new Map(e.nodes.map(({ name }) => [name, 0]))
  for (const { source, target } of e.links) {
    const targets = outgoing.get(source) ?? []
    targets.push(target)
    outgoing.set(source, targets)
    incoming.set(target, (incoming.get(target) ?? 0) + 1)
  }
  const ready = e.nodes
    .filter(({ name }) => incoming.get(name) === 0)
    .map(({ name }) => name)
  let lastDepth = 0
  for (const source of ready) {
    const nextDepth = (depth.get(source) ?? 0) + 1
    for (const target of outgoing.get(source) ?? []) {
      const remaining = (incoming.get(target) ?? 0) - 1
      incoming.set(target, remaining)
      depth.set(target, Math.max(depth.get(target) ?? 0, nextDepth))
      lastDepth = Math.max(lastDepth, nextDepth)
      if (remaining === 0) ready.push(target)
    }
  }
  if (ready.length !== e.nodes.length)
    return missing(
      "Sankey links contain a cycle. Remove cycles or choose a graph visual.",
    )
  const { colors, formats } = ctx
  const format = e.valueName ? formats[e.valueName] : undefined
  return {
    option: {
      tooltip: {
        trigger: "item",
        valueFormatter: (v: unknown) => formatValue(v, format),
      },
      series: [
        {
          type: "sankey",
          left: 8,
          right: 8,
          top: 8,
          bottom: 8,
          nodeGap: 10,
          nodeWidth: 12,
          emphasis: { focus: "adjacency" },
          label: { color: colors.contentPrimary, fontSize: 11 },
          lineStyle: { color: "gradient", opacity: 0.35, curveness: 0.5 },
          itemStyle: { borderWidth: 0 },
          levels: [{ depth: lastDepth, label: { position: "left" } }],
          data: e.nodes.map((n, i) => ({
            ...n,
            itemStyle: { color: palette(colors)[i % 8] },
          })),
          links: e.links,
        },
      ],
    },
    drawn: { nodes: e.nodes.length, links: e.links.length },
    problems: [],
  }
}

export const chordOption = (ctx: VisualContext): VisualBuild => {
  const e = edges(ctx)
  if (typeof e === "string") return missing(e)
  const { colors, formats } = ctx
  const format = e.valueName ? formats[e.valueName] : undefined
  return {
    option: {
      tooltip: {
        trigger: "item",
        valueFormatter: (v: unknown) => formatValue(v, format),
      },
      series: [
        {
          type: "chord",
          radius: ["78%", "84%"],
          clockwise: false,
          label: { show: true, color: colors.contentPrimary, fontSize: 11 },
          lineStyle: { color: "gradient", opacity: 0.4 },
          emphasis: { focus: "adjacency" },
          data: e.nodes.map((n, i) => ({
            ...n,
            itemStyle: { color: palette(colors)[i % 8] },
          })),
          links: e.links,
        },
      ],
    } as EChartsOption,
    drawn: { nodes: e.nodes.length, links: e.links.length },
    problems: [],
  }
}

// ── Map ──────────────────────────────────────────────────────────────────

type Bounds = [[number, number], [number, number]]

const boundsOf = (points: [number, number][], pad: number): Bounds | null => {
  if (points.length === 0) return null
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const [lon, lat] of points) {
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }
  // A view that spans most of the world is the world.
  if (maxLon - minLon > 250) return null
  const dLon = Math.max((maxLon - minLon) * pad, 4)
  const dLat = Math.max((maxLat - minLat) * pad, 3)
  return [
    [Math.max(minLon - dLon, -180), Math.min(maxLat + dLat, 85)],
    [Math.min(maxLon + dLon, 180), Math.max(minLat - dLat, -60)],
  ]
}

type WorldMap = {
  geoJSON?: {
    features?: {
      properties?: { name?: string }
      geometry?: { coordinates?: unknown }
    }[]
  }
}

/** The corners of the named countries on the world map, once it is loaded. */
const regionBounds = (names: Set<string>): Bounds | null => {
  const map = echarts.getMap("world") as WorldMap | undefined
  const points: [number, number][] = []
  const collect = (node: unknown) => {
    if (!Array.isArray(node)) return
    if (
      node.length >= 2 &&
      typeof node[0] === "number" &&
      typeof node[1] === "number"
    ) {
      points.push([node[0], node[1]])
      return
    }
    for (const child of node) collect(child)
  }
  for (const feature of map?.geoJSON?.features ?? []) {
    if (names.has(feature.properties?.name ?? ""))
      collect(feature.geometry?.coordinates)
  }
  if (points.length === 0) return null
  // Trim the outer 3% on each side, so remote islands do not stretch the view.
  const lons = points.map((p) => p[0]).sort((a, b) => a - b)
  const lats = points.map((p) => p[1]).sort((a, b) => a - b)
  const at = (list: number[], q: number) =>
    list[Math.floor(q * (list.length - 1))]
  return boundsOf(
    [
      [at(lons, 0.03), at(lats, 0.03)],
      [at(lons, 0.97), at(lats, 0.97)],
    ],
    0.08,
  )
}

export const mapOption = ({
  visual,
  statements,
  colors,
  formats,
}: VisualContext): VisualBuild => {
  const rows = statements[0]
  if (!rows || rows.rows.length === 0)
    return missing("The query returned no rows.")
  const c = visual.columns ?? {}
  const latIdx = columnIndex(
    rows,
    c.lat ?? (rows.columns.some((x) => x.name === "lat") ? "lat" : undefined),
  )
  const lonIdx = columnIndex(
    rows,
    c.lon ?? (rows.columns.some((x) => x.name === "lon") ? "lon" : undefined),
  )
  const valueIdx =
    c.value !== undefined
      ? columnIndex(rows, c.value)
      : firstColumnOf(rows, "numeric", [latIdx, lonIdx])
  const labelIdx =
    c.label !== undefined
      ? columnIndex(rows, c.label)
      : firstColumnOf(rows, "categorical")
  const format =
    valueIdx >= 0 ? formats[rows.columns[valueIdx].name] : undefined
  const geo = {
    map: "world",
    roam: true,
    zoom: 1.15,
    // ECharts retains omitted geo fields when it merges a refreshed option.
    boundingCoords: null,
    itemStyle: {
      areaColor: colors.surfaceRaised,
      borderColor: colors.borderDefault,
      borderWidth: 0.6,
    },
    emphasis: {
      itemStyle: { areaColor: colors.interactionHover },
      label: { show: false },
    },
    label: { show: false },
  }
  if (latIdx >= 0 && lonIdx >= 0) {
    const bounds = boundsOf(
      rows.rows.flatMap((r) => {
        const lon = toNumber(r[lonIdx])
        const lat = toNumber(r[latIdx])
        return lon === null || lat === null
          ? []
          : [[lon, lat] as [number, number]]
      }),
      0.15,
    )
    // A NULL value stays missing: it is not a reading of 0.
    const values = rows.rows.map((r) =>
      valueIdx >= 0 ? toNumber(r[valueIdx]) : 1,
    )
    // Sizes scale with magnitude, so the scale is the largest magnitude: a
    // negative value must not be measured against a positive (or no) maximum.
    const max = values.reduce<number>(
      (m, v) => (v === null ? m : Math.max(m, Math.abs(v))),
      1e-9,
    )
    return {
      option: {
        tooltip: {
          formatter: (p: unknown) => {
            const { name, value } = p as { name: string; value: number[] }
            return `${escapeHtml(name)}<br/>${escapeHtml(formatValue(value[2], format))}`
          },
        },
        geo: (bounds
          ? { ...geo, zoom: 1, boundingCoords: bounds }
          : geo) as EChartsOption["geo"],
        series: [
          {
            type: "effectScatter",
            coordinateSystem: "geo",
            showEffectOn: "emphasis",
            rippleEffect: { scale: 2.5, brushType: "stroke" },
            itemStyle: { color: colors.contentAccent },
            symbolSize: (v: (number | null)[]) =>
              v[2] === null ? 6 : 6 + 18 * Math.sqrt(Math.abs(v[2]) / max),
            data: rows.rows.map((r, i) => ({
              name: labelIdx >= 0 ? toLabel(r[labelIdx]) : "",
              // A point is drawn from its row, named by its label column;
              // without one an unbound click selects nothing.
              pick: pickOf(0, [i], labelIdx),
              value: [toNumber(r[lonIdx]), toNumber(r[latIdx]), values[i]],
              // A point with no value is drawn hollow, unlike a real 0.
              ...(values[i] === null
                ? {
                    itemStyle: {
                      color: "transparent",
                      borderColor: colors.contentAccent,
                      borderWidth: 1.5,
                    },
                  }
                : {}),
            })),
          },
        ],
      },
      drawn: { points: rows.rows.length },
      problems: [],
    }
  }
  const regionIdx =
    c.region !== undefined
      ? columnIndex(rows, c.region)
      : firstColumnOf(rows, "categorical")
  const err =
    need(rows, regionIdx, "region", c.region) ??
    need(rows, valueIdx, "value", c.value)
  if (err)
    return missing(
      `${err} A map needs region and value columns, or lat and lon columns.`,
    )
  // A region is drawn from its row's region.
  const data = rows.rows.map((r, i) => ({
    name: toLabel(r[regionIdx]),
    value: toNumber(r[valueIdx]),
    pick: pickOf(0, [i], regionIdx),
  }))
  const bounds = regionBounds(new Set(data.map((d) => d.name)))
  // The colour scale spans the real values: a NULL region is not a 0.
  const known = data.flatMap((d) => (d.value === null ? [] : [d.value]))
  const values = known.length > 0 ? known : [0]
  return {
    option: {
      tooltip: {
        trigger: "item",
        valueFormatter: (v: unknown) => formatValue(v, format),
      },
      visualMap: {
        min: Math.min(...values),
        max: Math.max(...values),
        left: 8,
        bottom: 8,
        itemHeight: 90,
        calculable: false,
        textStyle: { color: colors.contentSecondary, fontSize: 11 },
        formatter: (v: unknown) => formatValue(v, format),
        // The lowest value is tinted: plain surface is how a country with
        // no data (or a NULL value) is drawn.
        inRange: {
          color: [
            withAlpha(colors.chartSeries1, 0.3),
            colors.chartSeries1,
            colors.contentAccent,
          ],
        },
      },
      series: [
        {
          type: "map",
          ...geo,
          ...(bounds ? { zoom: 1, boundingCoords: bounds } : {}),
          data,
        },
      ] as EChartsOption["series"],
    },
    drawn: { regions: data.length },
    problems: [],
  }
}

// ── Liquidity heatmap and volume profile ─────────────────────────────────

const HEAT_CELLS = "qdbHeatCells"

const heatCellsRenderItem: CustomSeriesRenderItem = (params, api) => {
  const payload =
    (params as unknown as { itemPayload?: { dt?: number; dp?: number } })
      .itemPayload ?? {}
  const t = api.value(0) as number
  const p = api.value(1) as number
  const a = api.coord([t, p])
  const b = api.coord([t + (payload.dt ?? 0), p + (payload.dp ?? 0)])
  return {
    type: "rect",
    shape: {
      x: a[0],
      y: b[1],
      width: Math.max(b[0] - a[0], 1),
      height: Math.max(a[1] - b[1], 1),
    },
    style: { fill: api.visual("color") as string },
  }
}

echarts.registerCustomSeries(HEAT_CELLS, heatCellsRenderItem)

const smallestStep = (values: number[]): number => {
  const sorted = [...new Set(values)].sort((a, b) => a - b)
  let step = Infinity
  for (let i = 1; i < sorted.length; i++)
    step = Math.min(step, sorted[i] - sorted[i - 1])
  return Number.isFinite(step) && step > 0 ? step : 1
}

export const liquidityHeatmapOption = ({
  visual,
  statements,
  colors,
  formats,
}: VisualContext): VisualBuild => {
  const rows = statements[0]
  if (!rows || rows.rows.length === 0)
    return missing("The query returned no rows.")
  const c = visual.columns ?? {}
  const timeIdx =
    c.time !== undefined
      ? columnIndex(rows, c.time)
      : firstColumnOf(rows, "temporal")
  const priceIdx =
    c.price !== undefined
      ? columnIndex(rows, c.price)
      : firstColumnOf(rows, "numeric")
  const valueIdx =
    c.value !== undefined
      ? columnIndex(rows, c.value)
      : firstColumnOf(rows, "numeric", [priceIdx])
  const err =
    need(rows, timeIdx, "time", c.time) ??
    need(rows, priceIdx, "price", c.price) ??
    need(rows, valueIdx, "value", c.value)
  if (err) return missing(err)
  const cells = rows.rows.flatMap((row, index) => {
    const time = toTime(row[timeIdx])
    const price = toNumber(row[priceIdx])
    const size = toNumber(row[valueIdx])
    if (time === null || price === null || size === null) return []
    const value: [number, number, number] = [time, price, size]
    return [{ value, index }]
  })
  if (cells.length === 0)
    return missing("No drawable liquidity measurements were returned.")
  const dt = smallestStep(cells.map(({ value }) => value[0]))
  const dp = smallestStep(cells.map(({ value }) => value[1]))
  const values = cells.map(({ value }) => value[2])
  const priceFormat = formats[rows.columns[priceIdx].name] ?? {
    kind: "number" as const,
  }
  const valueFormat = formats[rows.columns[valueIdx].name]
  const series: unknown[] = [
    {
      type: "custom",
      name: rows.columns[valueIdx].name,
      renderItem: HEAT_CELLS,
      itemPayload: { dt, dp },
      encode: { x: 0, y: 1 },
      // A cell is drawn from its row's time, not the epoch milliseconds it
      // is drawn at.
      data: cells.map(({ value, index }) => ({
        value,
        pick: pickOf(0, [index], timeIdx),
      })),
      progressive: 0,
    },
  ]
  const line = statements[1]
  if (line && line.rows.length > 0) {
    const lt = firstColumnOf(line, "temporal")
    const lv = firstColumnOf(line, "numeric")
    if (lt >= 0 && lv >= 0) {
      series.push({
        type: "line",
        name: line.columns[lv].name,
        showSymbol: false,
        z: 5,
        // A surface halo keeps the line readable over the brightest cells.
        lineStyle: {
          color: colors.contentPrimary,
          width: 1.5,
          shadowColor: colors.surfaceInset,
          shadowBlur: 4,
        },
        itemStyle: { color: colors.contentPrimary },
        // A point of the line is drawn from its row's time.
        data: line.rows.map((r, i) => ({
          value: [toTime(r[lt]), toNumber(r[lv])],
          pick: pickOf(1, [i], lt),
        })),
      })
    }
  }
  return {
    option: {
      useUTC: true,
      tooltip: {
        trigger: "item",
        formatter: (p: unknown) => {
          const v = (p as { value: number[] }).value
          return `${escapeHtml(formatValue(v[1], priceFormat))}<br/>${escapeHtml(formatValue(v[2], valueFormat))}`
        },
      },
      grid: { left: 12, right: 72, top: 12, bottom: 32, containLabel: true },
      xAxis: { type: "time" },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { formatter: (v: number) => formatValue(v, priceFormat) },
      },
      visualMap: {
        type: "continuous",
        seriesIndex: 0,
        dimension: 2,
        min: Math.min(...values),
        max: Math.max(...values),
        right: 4,
        top: "middle",
        itemHeight: 120,
        calculable: false,
        textStyle: { color: colors.contentSecondary, fontSize: 10 },
        formatter: (v: unknown) =>
          formatValue(v, valueFormat ?? { compact: true }),
        inRange: {
          color: [
            withAlpha(colors.chartSeries1, 0.08),
            withAlpha(colors.chartSeries1, 0.55),
            colors.chartSeries1,
            colors.statusWarning,
          ],
        },
      },
      series: series as EChartsOption["series"],
    },
    drawn: { cells: cells.length, timeStep: dt, priceStep: dp },
    problems: [],
  }
}

export const volumeProfileOption = ({
  visual,
  statements,
  colors,
  formats,
}: VisualContext): VisualBuild => {
  const rows = statements[0]
  if (!rows || rows.rows.length === 0)
    return missing("The query returned no rows.")
  const c = visual.columns ?? {}
  const priceIdx = columnIndex(rows, c.price, 0)
  const buyIdx =
    c.buy !== undefined
      ? columnIndex(rows, c.buy)
      : c.value !== undefined
        ? -1
        : columnIndex(rows, undefined, 1)
  const sellIdx =
    c.sell !== undefined
      ? columnIndex(rows, c.sell)
      : c.value !== undefined
        ? -1
        : columnIndex(rows, undefined, 2)
  const valueIdx = c.value !== undefined ? columnIndex(rows, c.value) : -1
  const err =
    need(rows, priceIdx, "price", c.price) ??
    (c.value !== undefined
      ? need(rows, valueIdx, "value", c.value)
      : (need(rows, buyIdx, "buy", c.buy) ??
        (c.sell === undefined ? null : need(rows, sellIdx, "sell", c.sell))))
  if (err) return missing(err)
  // The rows' indexes, highest price first.
  const order = rows.rows
    .map((_, i) => i)
    .sort(
      (a, b) =>
        (toNumber(rows.rows[b][priceIdx]) ?? 0) -
        (toNumber(rows.rows[a][priceIdx]) ?? 0),
    )
  const sorted = order.map((i) => rows.rows[i])
  const priceName = rows.columns[priceIdx].name
  const priceFormat = formats[priceName] ?? {
    kind: "number" as const,
  }
  const prices = sorted.map((r) => formatValue(r[priceIdx], priceFormat))
  const total = sorted.map((r) => {
    if (valueIdx >= 0) return toNumber(r[valueIdx])
    const buy = toNumber(r[buyIdx])
    const sell = sellIdx >= 0 ? toNumber(r[sellIdx]) : null
    return buy === null && sell === null ? null : (buy ?? 0) + (sell ?? 0)
  })
  // Keep exact integer weights for picking the winner even though ECharts
  // needs floating-point values to lay out the bars.
  const indices = (valueIdx >= 0 ? [valueIdx] : [buyIdx, sellIdx]).filter(
    (i) => i >= 0,
  )
  const integerVolumes = indices.every((i) =>
    /^(BYTE|SHORT|INT|LONG)$/.test(rows.columns[i].type.toUpperCase()),
  )
  const exactTotal = (row: StatementRows["rows"][number]): bigint | null => {
    let sum = BigInt(0)
    for (const i of indices) {
      const raw = row[i]
      if (raw == null) continue
      if (typeof raw === "number" && Number.isSafeInteger(raw))
        sum += BigInt(raw)
      else if (typeof raw === "string" && /^-?\d{1,19}$/.test(raw))
        sum += BigInt(raw)
      else return null
    }
    return sum
  }
  let poc = -1
  let highest: number | bigint = -Infinity
  total.forEach((value, index) => {
    if (value === null) return
    const rank = integerVolumes ? (exactTotal(sorted[index]) ?? value) : value
    if (rank <= highest) return
    highest = rank
    poc = index
  })
  // A bar is drawn from its row's price, not its formatted label.
  const item = (value: number | null, index: number) => ({
    value,
    pick: pickOf(0, [order[index]], priceIdx),
  })
  const series =
    valueIdx >= 0
      ? [
          {
            type: "bar",
            name: rows.columns[valueIdx].name,
            data: total.map((value, index) => item(value, index)),
            itemStyle: { color: colors.chartSeries1 },
            barCategoryGap: "12%",
          },
        ]
      : [
          {
            type: "bar",
            name: rows.columns[buyIdx].name,
            stack: "v",
            data: sorted.map((r, i) => item(toNumber(r[buyIdx]), i)),
            itemStyle: { color: colors.dataPositive, opacity: 0.85 },
            barCategoryGap: "12%",
          },
          ...(sellIdx >= 0
            ? [
                {
                  type: "bar",
                  name: rows.columns[sellIdx].name,
                  stack: "v",
                  data: sorted.map((r, i) => item(toNumber(r[sellIdx]), i)),
                  itemStyle: { color: colors.dataNegative, opacity: 0.85 },
                },
              ]
            : []),
        ]
  return {
    option: {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { bottom: 0 },
      grid: { left: 12, right: 44, top: 8, bottom: 32, containLabel: true },
      xAxis: {
        type: "value",
        splitNumber: 3,
        axisLabel: {
          hideOverlap: true,
          formatter: (v: number) => formatValue(v, { compact: true }),
        },
      },
      yAxis: {
        type: "category",
        data: prices,
        inverse: true,
        axisTick: { show: false },
        axisLabel: {
          formatter: (v: string, i: number) => (i === poc ? `{poc|${v}}` : v),
          rich: { poc: { color: colors.statusWarning, fontWeight: "bold" } },
        },
      },
      series: series.map((s, i) =>
        i === series.length - 1
          ? {
              ...s,
              markLine: {
                symbol: "none",
                silent: true,
                lineStyle: { color: colors.statusWarning, type: "dashed" },
                label: {
                  formatter: "POC",
                  color: colors.statusWarning,
                  position: "insideEndTop",
                },
                data: poc < 0 ? [] : [{ yAxis: poc }],
              },
            }
          : s,
      ) as EChartsOption["series"],
    },
    drawn: { levels: sorted.length, pointOfControl: prices[poc] ?? "" },
    problems: [],
  }
}

// ── Footprint ─────────────────────────────────────────────────────────────

// A bar's candle, drawn on the left of its footprint levels: wick from low
// to high, body from open to close.
const FOOTPRINT_CANDLE = "qdbFootprintCandle"

const footprintCandleRenderItem: CustomSeriesRenderItem = (params, api) => {
  const payload =
    (
      params as unknown as {
        itemPayload?: { dt?: number; up?: string; down?: string }
      }
    ).itemPayload ?? {}
  const t = api.value(0) as number
  const open = api.value(1) as number
  const high = api.value(2) as number
  const low = api.value(3) as number
  const close = api.value(4) as number
  const left = api.coord([t, open])[0]
  const width = api.coord([t + (payload.dt ?? 0), open])[0] - left
  const x = left + width * 0.13
  const body = Math.max(2, Math.min(width * 0.12, 10))
  const yOpen = api.coord([t, open])[1]
  const yClose = api.coord([t, close])[1]
  const color = (close >= open ? payload.up : payload.down) ?? "currentColor"
  return {
    type: "group",
    children: [
      {
        type: "line",
        shape: {
          x1: x,
          y1: api.coord([t, high])[1],
          x2: x,
          y2: api.coord([t, low])[1],
        },
        style: { stroke: color, lineWidth: 1 },
      },
      {
        type: "rect",
        shape: {
          x: x - body / 2,
          y: Math.min(yOpen, yClose),
          width: body,
          height: Math.max(Math.abs(yOpen - yClose), 1),
        },
        style: { fill: color },
      },
    ],
  }
}

echarts.registerCustomSeries(FOOTPRINT_CANDLE, footprintCandleRenderItem)

// The bar a footprint level belongs to, as text for its tooltip.
const timeText = (value: unknown): string =>
  typeof value === "string"
    ? value.replace("T", " ").replace(/(:\d{2})(\.\d+)?Z$/, "$1")
    : toLabel(value)

export const footprintOption = ({
  visual,
  statements,
  colors,
  formats,
}: VisualContext): VisualBuild => {
  const rows = statements[0]
  if (!rows || rows.rows.length === 0)
    return missing("The query returned no rows.")
  const c = visual.columns ?? {}
  const timeIdx =
    c.time !== undefined
      ? columnIndex(rows, c.time)
      : firstColumnOf(rows, "temporal")
  const priceIdx =
    c.price !== undefined
      ? columnIndex(rows, c.price)
      : firstColumnOf(rows, "numeric")
  const buyIdx =
    c.buy !== undefined
      ? columnIndex(rows, c.buy)
      : firstColumnOf(rows, "numeric", [priceIdx])
  const sellIdx =
    c.sell !== undefined
      ? columnIndex(rows, c.sell)
      : firstColumnOf(rows, "numeric", [priceIdx, buyIdx])
  const err =
    need(rows, timeIdx, "time", c.time) ??
    need(rows, priceIdx, "price", c.price) ??
    need(rows, buyIdx, "buy", c.buy) ??
    need(rows, sellIdx, "sell", c.sell)
  if (err) return missing(err)

  const levels = rows.rows.flatMap((row, index) => {
    const time = toTime(row[timeIdx])
    const price = toNumber(row[priceIdx])
    const buy = toNumber(row[buyIdx])
    const sell = toNumber(row[sellIdx])
    if (time === null || price === null || (buy === null && sell === null))
      return []
    return [{ time, price, buy: buy ?? 0, sell: sell ?? 0, row, index }]
  })
  if (levels.length === 0)
    return missing("No drawable footprint levels were returned.")

  // A bar's point of control: its level with the most volume.
  const pocOf = new Map<number, number>()
  levels.forEach((level, i) => {
    const best = pocOf.get(level.time)
    const total = level.buy + level.sell
    if (best === undefined || total > levels[best].buy + levels[best].sell)
      pocOf.set(level.time, i)
  })
  const pocs = new Set(pocOf.values())
  const times = [...pocOf.keys()]
  const prices = levels.map((l) => l.price)
  // One bar or one level has no spacing to read: a minute, a price unit.
  const dt = times.length > 1 ? smallestStep(times) : 60_000
  const step = new Set(prices).size > 1 ? smallestStep(prices) : 1

  const candleRows = statements[1]
  const ct = candleRows ? firstColumnOf(candleRows, "temporal") : -1
  const ohlc: number[] = []
  if (candleRows && ct >= 0)
    for (const skip of [0, 1, 2, 3]) {
      const i = firstColumnOf(candleRows, "numeric", ohlc)
      if (i < 0 || skip !== ohlc.length) break
      ohlc.push(i)
    }
  const candles =
    candleRows && ohlc.length === 4
      ? candleRows.rows.flatMap((r) => {
          const t = toTime(r[ct])
          const v = ohlc.map((i) => toNumber(r[i]))
          return t === null || v.some((n) => n === null)
            ? []
            : [[t, ...(v as number[])]]
        })
      : []

  const priceName = rows.columns[priceIdx].name
  const priceFormat = formats[priceName] ?? { kind: "number" as const }
  const buyFormat = formats[rows.columns[buyIdx].name]
  const sellFormat = formats[rows.columns[sellIdx].name]
  const tip = (level: (typeof levels)[number]) =>
    [
      timeText(level.row[timeIdx]),
      `${formatValue(level.price, priceFormat)} – ${formatValue(level.price + step, priceFormat)}`,
      `${rows.columns[sellIdx].name} ${formatValue(level.row[sellIdx], sellFormat)} · ${rows.columns[buyIdx].name} ${formatValue(level.row[buyIdx], buyFormat)}`,
    ]
      .map(escapeHtml)
      .join("<br/>")

  const cells = {
    type: "custom",
    name: "footprint",
    renderItem: "footprint",
    encode: { x: 0, y: 1 },
    itemStyle: { color: withAlpha(colors.contentMuted, 0.18) },
    itemPayload: {
      dt,
      step,
      sell: 2,
      buy: 3,
      poc: 4,
      inset: candles.length > 0 ? 0.26 : 0.04,
      color: withAlpha(colors.chartUp, 0.45),
      color0: withAlpha(colors.chartDown, 0.45),
      borderColor: colors.statusWarning,
      label: { color: colors.contentPrimary },
    },
    // A level is drawn from its row's price.
    data: levels.map((level, i) => ({
      value: [
        level.time,
        level.price,
        level.sell,
        level.buy,
        pocs.has(i) ? 1 : 0,
      ],
      tip: tip(level),
      pick: pickOf(0, [level.index], priceIdx),
    })),
    progressive: 0,
  }
  const lows = [Math.min(...prices), ...candles.map((candle) => candle[3])]
  const highs = [
    Math.max(...prices) + step,
    ...candles.map((candle) => candle[2]),
  ]
  const series: unknown[] = [cells]
  if (candles.length > 0)
    series.push({
      type: "custom",
      name: "candle",
      renderItem: FOOTPRINT_CANDLE,
      encode: { x: 0, y: [1, 2, 3, 4] },
      itemPayload: { dt, up: colors.chartUp, down: colors.chartDown },
      silent: true,
      tooltip: { show: false },
      data: candles,
    })
  return {
    option: {
      useUTC: true,
      tooltip: {
        trigger: "item",
        formatter: (p: unknown) =>
          (p as { data?: { tip?: string } }).data?.tip ?? "",
      },
      grid: { left: 12, right: 16, top: 12, bottom: 28, containLabel: true },
      xAxis: {
        type: "time",
        min: Math.min(...times),
        max: Math.max(...times) + dt,
      },
      yAxis: {
        type: "value",
        min: Math.min(...lows),
        max: Math.max(...highs),
        axisLabel: { formatter: (v: number) => formatValue(v, priceFormat) },
      },
      series: series as EChartsOption["series"],
    },
    drawn: {
      bars: times.length,
      levels: levels.length,
      priceStep: step,
      candles: candles.length,
    },
    problems: [],
  }
}
