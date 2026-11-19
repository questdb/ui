// The console owns where a chart's parts sit. Agents (and hand-written
// options) set paddings that clip labels or leave half the panel empty, so a
// custom option or a visual is laid out here, for the panel's real size:
//
// - legends, shown visualMaps and zoom sliders stack along the bottom, as on
//   the preset charts, and the plot keeps clear of them;
// - every boxed part (grids, calendar, geo, parallel, single axis, matrix,
//   funnel, sankey, tree, treemap, graph, map) and every round part (pie,
//   gauge, sunburst, chord, radar, polar, the segmented doughnut) is moved
//   into the same content box, keeping the arrangement the option asked for
//   (two grids stacked stay stacked, rings stay concentric) but not its
//   paddings;
// - grids contain their axis labels and names; parts whose labels sit outside
//   them (tree and graph nodes, funnel and pie labels, radar indicators,
//   calendar months) get room for those labels, estimated from the data;
// - text overlays placed in percent (a total in a donut's middle) move with
//   the part they sit on.

export const CHART_PADDING = { top: 16, right: 24, bottom: 16, left: 24 }
const LEGEND_BAND = 28
const LEGEND_BOTTOM = 3
const VISUAL_MAP_BAND = 34
const SLIDER_BAND = 34
const SLIDER_HEIGHT = 18
const TITLE_BAND = 26
const CHAR_PX = 6.4
const LABEL_GAP = 10

type Size = { width: number; height: number }
type Rect = { x: number; y: number; w: number; h: number }
type Box = Record<string, unknown>

const isRecord = (value: unknown): value is Box =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const list = (value: unknown): Box[] =>
  (Array.isArray(value) ? value : value === undefined ? [] : [value]).filter(
    isRecord,
  )

/** A number, a percent of `base`, or `fallback`. */
const parse = (value: unknown, base: number, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const percent = /^(-?\d+(?:\.\d+)?)%$/.exec(value.trim())
    if (percent) return (Number(percent[1]) / 100) * base
    const n = Number(value)
    if (value.trim() !== "" && Number.isFinite(n)) return n
  }
  return fallback
}

const has = (box: Box, key: string) =>
  box[key] !== undefined && box[key] !== null

/** Where a box option (left/top/right/bottom/width/height) lands, in px. */
export const resolveBox = (box: Box, size: Size, inset = 0.1): Rect => {
  const axis = (
    start: "left" | "top",
    end: "right" | "bottom",
    extent: "width" | "height",
    total: number,
  ): [number, number] => {
    const margin = total * inset
    if (has(box, extent)) {
      const length = parse(box[extent], total, total - 2 * margin)
      const from = box[start]
      if (from === "center" || from === "middle")
        return [(total - length) / 2, length]
      if (from === "right" || from === "bottom") return [total - length, length]
      if (has(box, start)) return [parse(from, total, margin), length]
      if (has(box, end))
        return [total - parse(box[end], total, margin) - length, length]
      return [(total - length) / 2, length]
    }
    const a = parse(box[start], total, margin)
    const b = parse(box[end], total, margin)
    return [a, Math.max(total - a - b, 1)]
  }
  const [x, w] = axis("left", "right", "width", size.width)
  const [y, h] = axis("top", "bottom", "height", size.height)
  return { x, y, w, h }
}

const textWidth = (text: unknown) =>
  typeof text === "string" || typeof text === "number"
    ? String(text).length * CHAR_PX
    : 0

const longestName = (items: unknown, depth = 0): number => {
  if (depth > 12) return 0
  let longest = 0
  for (const item of Array.isArray(items) ? items : []) {
    if (!isRecord(item)) continue
    longest = Math.max(longest, textWidth(item.name))
    if (Array.isArray(item.children))
      longest = Math.max(longest, longestName(item.children, depth + 1))
  }
  return longest
}

const labelShown = (part: Box) => {
  const label = isRecord(part.label) ? part.label : {}
  return label.show !== false
}

const labelPosition = (part: Box): string | undefined => {
  const label = isRecord(part.label) ? part.label : {}
  return typeof label.position === "string" ? label.position : undefined
}

// ── Bands along the edges ────────────────────────────────────────────────

type Bands = { top: number; bottom: number }

const placeBottomBands = (option: Box, size: Size): Bands => {
  const bands: Bands = { top: 0, bottom: 0 }
  const shown = (part: Box) => part.show !== false

  const legends = list(option.legend).filter(shown)
  if (legends.length > 0) {
    option.legend = list(option.legend).map((legend) => {
      if (!shown(legend)) return legend
      const placed: Box = {
        ...legend,
        type: "scroll",
        orient: "horizontal",
        left: "center",
        bottom: LEGEND_BOTTOM,
        width: Math.max(size.width - 2 * CHART_PADDING.left, 40),
      }
      delete placed.top
      delete placed.right
      delete placed.height
      return placed
    })
    bands.bottom += LEGEND_BAND
  }

  if (list(option.visualMap).some(shown)) {
    const bottom = bands.bottom + 6
    option.visualMap = list(option.visualMap).map((map) => {
      if (!shown(map)) return map
      const placed: Box = {
        ...map,
        orient: "horizontal",
        left: "center",
        bottom,
        itemWidth: 10,
        ...(map.type === "piecewise"
          ? {}
          : {
              itemHeight: Math.min(160, Math.max(size.width * 0.35, 60)),
            }),
      }
      delete placed.top
      delete placed.right
      return placed
    })
    bands.bottom += VISUAL_MAP_BAND
  }

  const sliders = list(option.dataZoom).filter(
    (zoom) =>
      zoom.type === "slider" && shown(zoom) && zoom.orient !== "vertical",
  )
  if (sliders.length > 0) {
    const bottom = bands.bottom + 8
    option.dataZoom = list(option.dataZoom).map((zoom) => {
      if (!sliders.includes(zoom)) return zoom
      const placed: Box = {
        ...zoom,
        bottom,
        height: SLIDER_HEIGHT,
        left: CHART_PADDING.left + 8,
        right: CHART_PADDING.right + 8,
      }
      delete placed.top
      delete placed.width
      return placed
    })
    bands.bottom += SLIDER_BAND
  }

  // A title at an edge is a heading: give it its band. One placed inside
  // (top: "45%") is an overlay and moves with the chart below.
  option.title = list(option.title).map((title) => {
    if (title.show === false || isOverlay(title)) return title
    const atBottom = has(title, "bottom") && !has(title, "top")
    const placed: Box = { ...title, left: title.left ?? "center" }
    if (atBottom) {
      placed.bottom = bands.bottom + 4
      bands.bottom += TITLE_BAND
    } else {
      placed.top = CHART_PADDING.top - 8
      bands.top += TITLE_BAND
    }
    return placed
  })
  if ((option.title as Box[]).length === 0) delete option.title
  return bands
}

const isOverlay = (title: Box) => {
  const top = title.top
  if (top === "middle" || top === "center") return true
  if (typeof top === "string" && top.endsWith("%")) {
    const n = parseFloat(top)
    return n > 8 && n < 92
  }
  return false
}

// ── Parts that are moved ─────────────────────────────────────────────────

type BoxPart = {
  kind: "box"
  target: Box
  rect: Rect
  grid: boolean
  // Room for labels drawn outside the box.
  room: { left: number; right: number; top: number; bottom: number }
  calendar?: { columns: number; rows: number }
}

type CirclePart = {
  kind: "circle"
  target: Box
  // Where center/radius live (the series, or a custom series' itemPayload).
  holder: Box
  cx: number
  cy: number
  r0: number
  r: number
  radiusShape: "pair" | "single"
  // The drawn extent relative to the centre, as a share of r: a half donut
  // covers only the top half.
  extent: { left: number; right: number; top: number; bottom: number }
  room: { x: number; y: number }
}

type Part = BoxPart | CirclePart

const noRoom = { left: 0, right: 0, top: 0, bottom: 0 }

const ON_OTHER_SYSTEM = new Set([
  "matrix",
  "calendar",
  "cartesian2d",
  "polar",
  "geo",
  "singleAxis",
  "parallel",
])

const onOtherSystem = (part: Box) =>
  typeof part.coordinateSystem === "string" &&
  ON_OTHER_SYSTEM.has(part.coordinateSystem)

const calendarCells = (calendar: Box): { columns: number; rows: number } => {
  const range = calendar.range
  let days = 365
  if (Array.isArray(range) && range.length === 2) {
    const from = Date.parse(String(range[0]))
    const to = Date.parse(String(range[1]))
    if (Number.isFinite(from) && Number.isFinite(to))
      days = Math.abs(to - from) / 86_400_000 + 1
  } else if (typeof range === "string" && /^\d{4}-\d{2}$/.test(range)) {
    days = 31
  }
  const weeks = Math.ceil(days / 7) + 1
  return calendar.orient === "vertical"
    ? { columns: 7, rows: weeks }
    : { columns: weeks, rows: 7 }
}

const boxRoom = (type: string, part: Box): BoxPart["room"] => {
  const shown = labelShown(part)
  switch (type) {
    case "calendar":
      return { left: 28, right: 4, top: 22, bottom: 4 }
    case "parallel":
      return { left: 36, right: 24, top: 24, bottom: 8 }
    case "singleAxis":
      return { left: 8, right: 8, top: 4, bottom: 24 }
    case "tree": {
      if (!shown) return noRoom
      const names = longestName(part.data) + LABEL_GAP
      if (part.layout === "radial")
        return { left: names, right: names, top: names / 2, bottom: names / 2 }
      const orient = part.orient ?? "LR"
      if (orient === "TB" || orient === "BT" || orient === "vertical")
        return { left: names / 2, right: names / 2, top: 20, bottom: 20 }
      const root = longestName(
        Array.isArray(part.data) ? part.data.slice(0, 1) : [],
        11,
      )
      return orient === "RL"
        ? { left: names, right: root + LABEL_GAP, top: 8, bottom: 8 }
        : { left: root + LABEL_GAP, right: names, top: 8, bottom: 8 }
    }
    case "graph": {
      if (!shown || part.coordinateSystem) return noRoom
      const names = longestName(part.data ?? part.nodes) + LABEL_GAP
      return part.layout === "circular"
        ? { left: names, right: names, top: names * 0.6, bottom: names * 0.6 }
        : { left: names / 2, right: names / 2, top: 12, bottom: 12 }
    }
    case "sankey": {
      if (!shown) return noRoom
      if (part.orient === "vertical") return { ...noRoom, bottom: 18 }
      const position = labelPosition(part)
      if (position && position !== "right") return noRoom
      return { ...noRoom, right: longestName(part.data ?? part.nodes) + 8 }
    }
    case "funnel": {
      if (!shown) return noRoom
      const position = labelPosition(part) ?? "outside"
      if (
        !["left", "right", "outside", "leftTop", "rightTop"].includes(position)
      )
        return noRoom
      const line = isRecord(part.labelLine) ? part.labelLine : {}
      const room =
        longestName(part.data) + parse(line.length, 0, 20) + LABEL_GAP
      return position.startsWith("left")
        ? { ...noRoom, left: room }
        : { ...noRoom, right: room }
    }
    default:
      return noRoom
  }
}

const BOX_COMPONENTS = ["calendar", "geo", "parallel", "singleAxis", "matrix"]
const BOX_SERIES = new Set([
  "funnel",
  "sankey",
  "tree",
  "treemap",
  "graph",
  "map",
])

const DEFAULT_RADIUS: Record<string, unknown> = {
  pie: [0, "75%"],
  gauge: "75%",
  sunburst: [0, "75%"],
  chord: ["70%", "80%"],
  radar: "75%",
  polar: [0, "80%"],
  segmentedDoughnut: ["50%", "60%"],
}

/** The share of r an arc reaches from its centre on each side. */
const arcExtent = (start: number, end: number, clockwise: boolean) => {
  const raw = clockwise ? start - end : end - start
  if (!Number.isFinite(raw)) return { left: 1, right: 1, top: 1, bottom: 1 }
  const sweep = ((raw % 360) + 360) % 360
  if (sweep === 0) return { left: 1, right: 1, top: 1, bottom: 1 }
  const angles = [start, clockwise ? start - sweep : start + sweep]
  for (let a = Math.ceil(start / 90) * 90 - 360; a <= start + 360; a += 90) {
    const inside = clockwise
      ? a <= start && a >= start - sweep
      : a >= start && a <= start + sweep
    if (inside) angles.push(a)
  }
  const xs = angles.map((a) => Math.cos((a * Math.PI) / 180))
  const ys = angles.map((a) => -Math.sin((a * Math.PI) / 180))
  // The centre is part of the shape (the hub of a gauge, a donut's base).
  return {
    left: Math.max(0, -Math.min(0, ...xs)),
    right: Math.max(0, Math.max(0, ...xs)),
    top: Math.max(0, -Math.min(0, ...ys)),
    bottom: Math.max(0, Math.max(0, ...ys)),
  }
}

const circlePart = (
  target: Box,
  holder: Box,
  type: string,
  size: Size,
  room: { x: number; y: number },
): CirclePart => {
  const center: unknown[] = Array.isArray(holder.center)
    ? (holder.center as unknown[])
    : [holder.center ?? "50%", holder.center ?? "50%"]
  const half = Math.min(size.width, size.height) / 2
  const radius = holder.radius ?? DEFAULT_RADIUS[type]
  const pair = Array.isArray(radius)
  const [r0Raw, rRaw]: unknown[] = pair ? (radius as unknown[]) : [0, radius]
  let extent = { left: 1, right: 1, top: 1, bottom: 1 }
  if (type === "pie" && has(target, "endAngle") && target.endAngle !== "auto")
    extent = arcExtent(
      parse(target.startAngle, 0, 90),
      parse(target.endAngle, 0, -270),
      target.clockwise !== false,
    )
  if (type === "gauge") {
    extent = arcExtent(
      parse(target.startAngle, 0, 225),
      parse(target.endAngle, 0, -45),
      target.clockwise !== false,
    )
    // The value and its name sit below the centre (offsetCenter, in % of r).
    const below = [target, ...list(target.data)].flatMap((part) =>
      ["detail", "title"].map((key) => {
        const text = isRecord(part[key]) ? part[key] : undefined
        if (part === target && text?.show === false) return 0
        const offset: unknown = Array.isArray(text?.offsetCenter)
          ? (text.offsetCenter as unknown[])[1]
          : key === "detail"
            ? "40%"
            : "20%"
        return (typeof offset === "number" ? 0.4 : parse(offset, 1, 0)) + 0.18
      }),
    )
    extent = { ...extent, bottom: Math.max(extent.bottom, ...below) }
  }
  return {
    kind: "circle",
    target,
    holder,
    cx: parse(center[0], size.width, size.width / 2),
    cy: parse(center[1], size.height, size.height / 2),
    r0: parse(r0Raw, half, 0),
    r: Math.max(parse(rRaw, half, half * 0.75), 1),
    radiusShape: pair ? "pair" : "single",
    extent,
    room,
  }
}

const collectParts = (option: Box, size: Size): Part[] => {
  const parts: Part[] = []
  const boxPart = (target: Box, type: string, grid = false) => {
    parts.push({
      kind: "box",
      target,
      rect: resolveBox(target, size, grid ? 0.1 : 0.08),
      grid,
      room: boxRoom(type, target),
      calendar: type === "calendar" ? calendarCells(target) : undefined,
    })
  }

  for (const grid of list(option.grid)) {
    if (onOtherSystem(grid) || grid.show === false) continue
    boxPart(grid, "grid", true)
  }
  for (const key of BOX_COMPONENTS)
    for (const part of list(option[key]))
      if (!onOtherSystem(part)) boxPart(part, key)

  for (const radar of list(option.radar)) {
    const names = Array.isArray(radar.indicator)
      ? Math.max(
          ...radar.indicator.map((i) => textWidth(isRecord(i) ? i.name : "")),
          0,
        )
      : 0
    parts.push(
      circlePart(radar, radar, "radar", size, { x: names + LABEL_GAP, y: 22 }),
    )
  }
  for (const polar of list(option.polar))
    if (!onOtherSystem(polar))
      parts.push(circlePart(polar, polar, "polar", size, { x: 24, y: 20 }))

  for (const series of list(option.series)) {
    const type = typeof series.type === "string" ? series.type : ""
    if (onOtherSystem(series)) continue
    if (BOX_SERIES.has(type)) {
      if (type === "map" && series.geoIndex !== undefined) continue
      boxPart(series, type)
    } else if (type === "pie") {
      const outside =
        labelShown(series) &&
        !["inside", "inner", "center"].includes(
          labelPosition(series) ?? "outside",
        )
      const names = outside ? longestName(series.data) + 28 : 0
      parts.push(
        circlePart(series, series, "pie", size, {
          x: names,
          y: outside ? 24 : 0,
        }),
      )
    } else if (type === "gauge") {
      parts.push(circlePart(series, series, "gauge", size, { x: 4, y: 4 }))
    } else if (type === "sunburst") {
      parts.push(circlePart(series, series, "sunburst", size, { x: 0, y: 0 }))
    } else if (type === "chord") {
      const names = labelShown(series) ? longestName(series.data) + 12 : 0
      parts.push(circlePart(series, series, "chord", size, { x: names, y: 20 }))
    } else if (
      type === "custom" &&
      series.renderItem === "segmentedDoughnut" &&
      isRecord(series.itemPayload)
    ) {
      parts.push(
        circlePart(series, series.itemPayload, "segmentedDoughnut", size, {
          x: 0,
          y: 0,
        }),
      )
    }
  }
  return parts
}

// ── Fitting ──────────────────────────────────────────────────────────────

type Transform = (x: number, y: number) => [number, number]

/**
 * The option laid out for a panel of `size`: see the top of this file.
 * Returns a copy; the input is not changed.
 */
export const fitLayout = <T extends object>(input: T, size: Size): T => {
  if (size.width < 40 || size.height < 40) return input
  const option = { ...(input as Box) }
  for (const key of [
    "series",
    "grid",
    "legend",
    "visualMap",
    "dataZoom",
    "title",
    "radar",
    "polar",
    ...BOX_COMPONENTS,
  ]) {
    const value = option[key]
    if (Array.isArray(value))
      option[key] = (value as unknown[]).map((v) =>
        isRecord(v)
          ? {
              ...v,
              ...(isRecord(v.itemPayload)
                ? { itemPayload: { ...v.itemPayload } }
                : {}),
            }
          : v,
      )
    else if (isRecord(value)) option[key] = { ...value }
  }

  const bands = placeBottomBands(option, size)
  const content: Rect = {
    x: CHART_PADDING.left,
    y: CHART_PADDING.top + bands.top,
    w: 0,
    h: 0,
  }
  content.w = Math.max(
    size.width - CHART_PADDING.left - CHART_PADDING.right,
    10,
  )
  const bottom = bands.bottom > 0 ? bands.bottom + 6 : CHART_PADDING.bottom
  content.h = Math.max(size.height - content.y - bottom, 10)

  // Axes without a grid get the default one, whose paddings are ECharts'.
  if ((option.xAxis || option.yAxis) && option.grid === undefined)
    option.grid = {}
  const parts = collectParts(option, size)
  if (parts.length === 0) return option as T

  const circles = parts.filter((p): p is CirclePart => p.kind === "circle")
  const boxes = parts.filter((p): p is BoxPart => p.kind === "box")

  // The arrangement the option drew, as one rectangle.
  const shapes = parts.map((p) =>
    p.kind === "box"
      ? p.rect
      : {
          x: p.cx - p.r * p.extent.left,
          y: p.cy - p.r * p.extent.top,
          w: p.r * (p.extent.left + p.extent.right),
          h: p.r * (p.extent.top + p.extent.bottom),
        },
  )
  const union = shapes.reduce((u, s) => {
    const x = Math.min(u.x, s.x)
    const y = Math.min(u.y, s.y)
    return {
      x,
      y,
      w: Math.max(u.x + u.w, s.x + s.w) - x,
      h: Math.max(u.y + u.h, s.y + s.h) - y,
    }
  })
  union.w = Math.max(union.w, 1)
  union.h = Math.max(union.h, 1)

  let transform: Transform
  let scale = 1
  if (circles.length === 0) {
    // Boxes only: fill the content box.
    const sx = content.w / union.w
    const sy = content.h / union.h
    transform = (x, y) => [
      content.x + (x - union.x) * sx,
      content.y + (y - union.y) * sy,
    ]
  } else {
    // Round parts keep their shape: one scale, centred, with room for the
    // labels drawn around them.
    const roomX = Math.max(...circles.map((c) => c.room.x))
    const roomY = Math.max(...circles.map((c) => c.room.y))
    const inner = {
      x: content.x + roomX,
      y: content.y + roomY,
      w: Math.max(content.w - 2 * roomX, 10),
      h: Math.max(content.h - 2 * roomY, 10),
    }
    scale = Math.min(inner.w / union.w, inner.h / union.h)
    const ox = inner.x + (inner.w - union.w * scale) / 2 - union.x * scale
    const oy = inner.y + (inner.h - union.h * scale) / 2 - union.y * scale
    transform = (x, y) => [x * scale + ox, y * scale + oy]
  }

  for (const part of boxes) {
    const [x1, y1] = transform(part.rect.x, part.rect.y)
    const [x2, y2] = transform(
      part.rect.x + part.rect.w,
      part.rect.y + part.rect.h,
    )
    let left = x1 + part.room.left
    let top = y1 + part.room.top
    let right = size.width - x2 + part.room.right
    let bottomPx = size.height - y2 + part.room.bottom
    const target = part.target
    delete target.width
    delete target.height
    if (part.calendar) {
      // Square cells, as large as fit, centred.
      const w = size.width - left - right
      const h = size.height - top - bottomPx
      const cell = Math.max(
        Math.floor(Math.min(w / part.calendar.columns, h / part.calendar.rows)),
        4,
      )
      const cw = cell * part.calendar.columns
      const ch = cell * part.calendar.rows
      left += (w - cw) / 2
      right += (w - cw) / 2
      top += (h - ch) / 2
      bottomPx += (h - ch) / 2
      target.cellSize = [cell, cell]
    }
    target.left = Math.round(left)
    target.top = Math.round(top)
    target.right = Math.round(right)
    target.bottom = Math.round(bottomPx)
    if (part.grid) {
      delete target.containLabel
      target.outerBoundsMode = "same"
      target.outerBoundsContain = "all"
    }
  }

  for (const part of circles) {
    const [cx, cy] = transform(part.cx, part.cy)
    const holder = part.holder
    holder.center = [Math.round(cx), Math.round(cy)]
    const r = Math.round(part.r * scale)
    const r0 = Math.round(part.r0 * scale)
    holder.radius = part.radiusShape === "pair" ? [r0, r] : r
    if (holder === part.target)
      for (const key of ["left", "top", "right", "bottom", "width", "height"])
        delete holder[key]
  }

  // Overlays placed in percent or px move with the chart under them: with
  // the nearest round part (a total in a donut keeps its offset from the
  // centre), or with the boxes.
  if (Array.isArray(option.title))
    option.title = (option.title as Box[]).map((title) => {
      if (!isOverlay(title)) return title
      const x =
        title.left === "center"
          ? size.width / 2
          : parse(title.left, size.width, size.width / 2)
      const y = parse(
        title.top === "middle" || title.top === "center" ? "50%" : title.top,
        size.height,
        size.height / 2,
      )
      const nearest = circles
        .map((c) => ({ c, d: Math.hypot(c.cx - x, c.cy - y) }))
        .sort((a, b) => a.d - b.d)[0]?.c
      if (nearest) {
        const center = nearest.holder.center as number[]
        return {
          ...title,
          left: Math.round(center[0] + x - nearest.cx),
          top: Math.round(center[1] + y - nearest.cy),
        }
      }
      const [nx, ny] = transform(x, y)
      return { ...title, left: Math.round(nx), top: Math.round(ny) }
    })

  return option as T
}
