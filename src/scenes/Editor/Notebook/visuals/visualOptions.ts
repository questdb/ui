import type { CustomSeriesRenderItem, EChartsOption } from "echarts"
import type { ColorShape } from "../../../../types/styled"
import type { VisualConfig } from "../CellChart/chartTypes"
import { echarts } from "../CellChart/echartsSetup"
import { classifyColumn } from "../CellChart/inferChartConfig"
import {
  formatValue,
  thresholdBands,
  toneColor,
  type ColumnFormats,
} from "../../../../utils/formats/columnFormat"
import {
  columnIndex,
  firstColumnOf,
  linksFrom,
  nodesOf,
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
  const valueIdx =
    columnIndex(rows, visual.columns?.value) >= 0
      ? columnIndex(rows, visual.columns?.value)
      : firstColumnOf(rows, "numeric")
  const err = need(rows, valueIdx, "value", visual.columns?.value)
  if (err) return missing(err)
  const valueName = rows.columns[valueIdx].name
  const format = formats[valueName]
  const value = toNumber(rows.rows[0][valueIdx]) ?? 0
  const labelIdx = columnIndex(rows, visual.columns?.label)
  const min = visual.min ?? 0
  const max =
    visual.max ?? (format?.kind === "percent" ? 1 : Math.max(100, value))
  const bands = thresholdBands(format, min, max)
  const axisColor: [number, string][] =
    bands.length > 0
      ? bands.map((b) => [
          (b.to - min) / (max - min),
          toneColor(b.tone, colors),
        ])
      : [[1, colors.borderDefault]]
  const label = labelIdx >= 0 ? toLabel(rows.rows[0][labelIdx]) : valueName
  return {
    option: {
      series: [
        {
          type: "gauge",
          min,
          max,
          startAngle: 210,
          endAngle: -30,
          splitNumber: 4,
          radius: "92%",
          center: ["50%", "58%"],
          progress: {
            show: true,
            width: 10,
            itemStyle: { color: colors.contentPrimary, opacity: 0.85 },
          },
          axisLine: { lineStyle: { width: 10, color: axisColor } },
          pointer: { show: false },
          anchor: { show: false },
          axisTick: { show: false },
          splitLine: {
            distance: 4,
            length: 6,
            lineStyle: { color: colors.borderStrong, width: 1 },
          },
          axisLabel: {
            distance: 16,
            color: colors.contentSecondary,
            fontSize: 11,
            formatter: (v: number) =>
              formatValue(v, format ? { ...format, suffix: "" } : undefined),
          },
          title: {
            offsetCenter: [0, "38%"],
            color: colors.contentSecondary,
            fontSize: 12,
          },
          detail: {
            offsetCenter: [0, "5%"],
            valueAnimation: true,
            fontSize: 28,
            fontWeight: 600,
            color: colors.contentPrimary,
            formatter: (v: number) => formatValue(v, format),
          },
          data: [{ value, name: label }],
        },
      ],
    },
    drawn: { value, min, max, bands: bands.length },
    problems: [],
  }
}

// ── State timeline ───────────────────────────────────────────────────────

const STATE_TIMELINE = "qdbStateTimeline"

const stateTimelineRenderItem: CustomSeriesRenderItem = (params, api) => {
  const lane = api.value(2)
  const start = api.coord([api.value(0), lane])
  const end = api.coord([api.value(1), lane])
  const height = (api.size?.([0, 1]) as number[])[1] * 0.62
  const x = start[0]
  const width = Math.max(end[0] - start[0], 1)
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
  const rows = statements[0]
  if (!rows || rows.rows.length === 0)
    return missing("The query returned no rows.")
  const c = visual.columns ?? {}
  const timeIdx =
    c.time !== undefined
      ? columnIndex(rows, c.time)
      : firstColumnOf(rows, "temporal")
  const endIdx = c.end !== undefined ? columnIndex(rows, c.end) : -1
  const laneIdx =
    c.lane !== undefined
      ? columnIndex(rows, c.lane)
      : firstColumnOf(rows, "categorical")
  const stateIdx =
    c.state !== undefined
      ? columnIndex(rows, c.state)
      : rows.columns.findIndex(
          (_, i) => i !== timeIdx && i !== laneIdx && i !== endIdx,
        )
  const err =
    need(rows, timeIdx, "time", c.time) ??
    need(rows, laneIdx, "lane", c.lane) ??
    need(rows, stateIdx, "state", c.state)
  if (err) return missing(err)

  type Seg = { lane: string; state: string; start: number; end: number | null }
  const segs: Seg[] = []
  for (const row of rows.rows) {
    const start = toTime(row[timeIdx])
    if (start === null) continue
    segs.push({
      lane: toLabel(row[laneIdx]),
      state: toLabel(row[stateIdx]),
      start,
      end: endIdx >= 0 ? toTime(row[endIdx]) : null,
    })
  }
  // Without an end column a state lasts until the lane's next row.
  const maxTime = Math.max(...segs.map((s) => s.end ?? s.start))
  const byLane = new Map<string, Seg[]>()
  for (const s of segs) byLane.set(s.lane, [...(byLane.get(s.lane) ?? []), s])
  for (const list of byLane.values()) {
    list.sort((a, b) => a.start - b.start)
    list.forEach((s, i) => {
      s.end ??= list[i + 1]?.start ?? maxTime
    })
  }
  const lanes = [...byLane.keys()]
  const states = [...new Set(segs.map((s) => s.state))]
  const colorOf = (state: string) => {
    const lower = state.toLowerCase()
    if (/^(ok|up|active|running|healthy|on|true)$/.test(lower))
      return colors.dataPositive
    if (/^(error|down|failed|fault|suspended|critical|false)$/.test(lower))
      return colors.dataNegative
    if (/^(warn|warning|degraded|paused|lagging|pending)$/.test(lower))
      return colors.statusWarning
    return palette(colors)[states.indexOf(state) % 8]
  }
  return {
    option: {
      useUTC: true,
      tooltip: {
        formatter: (p: unknown) => {
          const v = (p as { value: [number, number, number, number] }).value
          const s = states[v[3]]
          const minutes = Math.round((v[1] - v[0]) / 60000)
          return `${lanes[v[2]]}<br/><b>${s.replace(/</g, "&lt;")}</b> · ${minutes} min`
        },
      },
      grid: { left: 12, right: 24, top: 12, bottom: 36, containLabel: true },
      xAxis: { type: "time" },
      yAxis: {
        type: "category",
        data: lanes,
        inverse: true,
        axisTick: { show: false },
        splitLine: { show: false },
      },
      legend: { bottom: 0, data: states },
      series: states.map((state) => ({
        type: "custom",
        name: state,
        renderItem: STATE_TIMELINE,
        encode: { x: [0, 1], y: 2 },
        itemStyle: { color: colorOf(state) },
        data: segs
          .filter((s) => s.state === state)
          .map((s) => [
            s.start,
            s.end,
            lanes.indexOf(s.lane),
            states.indexOf(state),
          ]),
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

const withColorValues = (nodes: TreeNode[]): unknown[] =>
  nodes.map((n) => ({
    name: n.name,
    value: n.colorValue !== undefined ? [n.value, n.colorValue] : n.value,
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
      color: [colors.dataNegative, colors.surfaceRaised, colors.dataPositive],
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
  const valueFormat = formats[h.valueName]
  const colorFormat = h.colorName ? formats[h.colorName] : undefined
  const changes = colorValues(h.tree)
  return {
    option: {
      tooltip: {
        formatter: (p: unknown) => {
          const { name, value } = p as {
            name: string
            value: number | number[]
          }
          const [v, c] = Array.isArray(value) ? value : [value, undefined]
          return `${name.replace(/</g, "&lt;")}<br/>${formatValue(v, valueFormat)}${c !== undefined ? ` · ${formatValue(c, colorFormat ?? { kind: "percent" })}` : ""}`
        },
      },
      ...(changes.length > 0
        ? { visualMap: divergingVisualMap(colors, changes) }
        : {}),
      series: [
        {
          type: "treemap",
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          width: "100%",
          height: "100%",
          top: 0,
          left: 0,
          label: {
            show: true,
            color: colors.contentPrimary,
            fontSize: 12,
            formatter: (p: unknown) => {
              const { name, value } = p as {
                name: string
                value: number | number[]
              }
              const c = Array.isArray(value) ? value[1] : undefined
              return c !== undefined
                ? `${name}\n${formatValue(c, colorFormat ?? { kind: "percent", signTone: true })}`
                : name
            },
          },
          upperLabel: {
            show: true,
            height: 18,
            color: colors.contentSecondary,
            fontSize: 11,
          },
          itemStyle: {
            borderColor: colors.surfaceInset,
            borderWidth: 1,
            gapWidth: 1,
          },
          levels: [
            { itemStyle: { borderWidth: 0, gapWidth: 3 } },
            { itemStyle: { gapWidth: 1 } },
          ],
          ...(changes.length === 0
            ? { colorMappingBy: "index" }
            : { visualDimension: 1 }),
          data: withColorValues(h.tree),
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
          return `${name.replace(/</g, "&lt;")}<br/>${formatValue(v, valueFormat)}`
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
          label: { color: colors.contentPrimary, fontSize: 11, minAngle: 8 },
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
    need(rows, fromIdx, "from", c.from) ?? need(rows, toIdx, "to", c.to)
  if (err) return err
  const links = linksFrom(rows, fromIdx, toIdx, valueIdx)
  return {
    links,
    nodes: nodesOf(links),
    valueName: valueIdx >= 0 ? rows.columns[valueIdx].name : undefined,
  }
}

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
          const esc = (t: string | undefined) => (t ?? "").replace(/</g, "&lt;")
          return dataType === "edge"
            ? `${esc(data.source)} → ${esc(data.target)}<br/>${formatValue(data.value, format)}`
            : `${esc(data.name)}<br/>${formatValue(weight.get(data.name ?? ""), format)}`
        },
      },
      series: [
        {
          type: "graph",
          layout: "force",
          roam: true,
          draggable: true,
          force: { repulsion: 220, edgeLength: [60, 160], gravity: 0.08 },
          label: {
            show: true,
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
            name: n.name,
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
  // Labels sit right of their node, except on the last column, where they
  // would run off the chart.
  const depth = new Map<string, number>()
  for (let pass = 0; pass < e.nodes.length; pass++) {
    for (const l of e.links) {
      const d = (depth.get(l.source) ?? 0) + 1
      if (d > (depth.get(l.target) ?? 0)) depth.set(l.target, d)
    }
  }
  const lastDepth = Math.max(0, ...depth.values())
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
    const values = rows.rows.map((r) =>
      valueIdx >= 0 ? (toNumber(r[valueIdx]) ?? 0) : 1,
    )
    const max = Math.max(...values, 1e-9)
    return {
      option: {
        tooltip: {
          formatter: (p: unknown) => {
            const { name, value } = p as { name: string; value: number[] }
            return `${name.replace(/</g, "&lt;")}<br/>${formatValue(value[2], format)}`
          },
        },
        geo: bounds ? { ...geo, zoom: 1, boundingCoords: bounds } : geo,
        series: [
          {
            type: "effectScatter",
            coordinateSystem: "geo",
            rippleEffect: { scale: 2.5, brushType: "stroke" },
            itemStyle: { color: colors.contentAccent },
            symbolSize: (v: number[]) =>
              6 + 18 * Math.sqrt(Math.abs(v[2]) / max),
            data: rows.rows.map((r, i) => ({
              name: labelIdx >= 0 ? toLabel(r[labelIdx]) : "",
              value: [toNumber(r[lonIdx]), toNumber(r[latIdx]), values[i]],
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
  const data = rows.rows.map((r) => ({
    name: toLabel(r[regionIdx]),
    value: toNumber(r[valueIdx]),
  }))
  const bounds = regionBounds(new Set(data.map((d) => d.name)))
  const values = data.map((d) => d.value ?? 0)
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
        inRange: {
          color: [
            colors.surfaceRaised,
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
  const cells = rows.rows
    .map((r) => [
      toTime(r[timeIdx]),
      toNumber(r[priceIdx]),
      toNumber(r[valueIdx]),
    ])
    .filter((v): v is [number, number, number] => v.every((x) => x !== null))
  const dt = smallestStep(cells.map((v) => v[0]))
  const dp = smallestStep(cells.map((v) => v[1]))
  const values = cells.map((v) => v[2])
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
      data: cells,
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
        lineStyle: { color: colors.contentPrimary, width: 1.5 },
        itemStyle: { color: colors.contentPrimary },
        data: line.rows.map((r) => [toTime(r[lt]), toNumber(r[lv])]),
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
          return `${formatValue(v[1], priceFormat)}<br/>${formatValue(v[2], valueFormat)}`
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
            colors.surfaceInset,
            colors.chartSeries1,
            colors.statusWarning,
            colors.dataNegative,
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
    (valueIdx < 0 && buyIdx < 0
      ? `buy: column not found. Columns: ${columnNames(rows)}.`
      : null)
  if (err) return missing(err)
  const sorted = [...rows.rows].sort(
    (a, b) => (toNumber(b[priceIdx]) ?? 0) - (toNumber(a[priceIdx]) ?? 0),
  )
  const priceFormat = formats[rows.columns[priceIdx].name] ?? {
    kind: "number" as const,
  }
  const prices = sorted.map((r) => formatValue(r[priceIdx], priceFormat))
  const total = sorted.map((r) =>
    valueIdx >= 0
      ? (toNumber(r[valueIdx]) ?? 0)
      : (toNumber(r[buyIdx]) ?? 0) +
        (sellIdx >= 0 ? (toNumber(r[sellIdx]) ?? 0) : 0),
  )
  const poc = total.indexOf(Math.max(...total))
  const series =
    valueIdx >= 0
      ? [
          {
            type: "bar",
            name: rows.columns[valueIdx].name,
            data: total,
            itemStyle: { color: colors.chartSeries1 },
            barCategoryGap: "12%",
          },
        ]
      : [
          {
            type: "bar",
            name: rows.columns[buyIdx].name,
            stack: "v",
            data: sorted.map((r) => toNumber(r[buyIdx])),
            itemStyle: { color: colors.dataPositive, opacity: 0.85 },
            barCategoryGap: "12%",
          },
          ...(sellIdx >= 0
            ? [
                {
                  type: "bar",
                  name: rows.columns[sellIdx].name,
                  stack: "v",
                  data: sorted.map((r) => toNumber(r[sellIdx])),
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
                data: [{ yAxis: prices[poc] }],
              },
            }
          : s,
      ) as EChartsOption["series"],
    },
    drawn: { levels: sorted.length, pointOfControl: prices[poc] ?? "" },
    problems: [],
  }
}
