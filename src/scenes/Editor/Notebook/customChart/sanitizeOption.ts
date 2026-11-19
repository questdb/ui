import type { ColorShape } from "../../../../types/styled"
import { isTone, toneColor } from "../../../../utils/formats/columnFormat"
import { copyPlainOption } from "../../../../store/notebookFormat"

// Makes an agent-written ECharts option safe and on-style before it is drawn.
//
// Safety. JSON has no functions, but an option can still run script or leak
// data: a tooltip `formatter` string is inserted into the page as HTML, a
// title `link` is opened with window.open, and image URLs are fetched. The
// sanitizer escapes tooltip templates, drops links and tooltip DOM options,
// and allows only data: images.
//
// Style. Colours come from the console theme: an option names a tone such as
// "$positive" or "$series3" (optionally "$warning:0.3" for 30% opacity), and
// literal colours and fonts are removed. The theme supplies everything else.

export type OptionProblem = {
  path: string
  message: string
  severity: "error" | "warning"
}

export type SanitizeContext = {
  colors: ColorShape
  /** Names a `renderItem` string may use: built-in and notebook chart types. */
  renderItems: ReadonlyMap<string, string>
  /** Map names registered with ECharts. */
  maps: ReadonlySet<string>
}

export const SERIES_TYPES = new Set([
  "line",
  "bar",
  "pie",
  "scatter",
  "effectScatter",
  "candlestick",
  "boxplot",
  "heatmap",
  "map",
  "graph",
  "tree",
  "treemap",
  "sunburst",
  "sankey",
  "chord",
  "funnel",
  "gauge",
  "parallel",
  "lines",
  "themeRiver",
  "pictorialBar",
  "radar",
  "custom",
])

const COLOR_KEYS = new Set([
  "color",
  "color0",
  "backgroundColor",
  "borderColor",
  "borderColor0",
  "shadowColor",
  "textBorderColor",
  "textShadowColor",
  "fill",
  "stroke",
  "inactiveColor",
  "fillerColor",
  "handleColor",
  "dataBackgroundColor",
])

const DROPPED_TOOLTIP_KEYS = [
  "extraCssText",
  "className",
  "appendTo",
  "appendToBody",
  "enterable",
  "renderMode",
]

const DROPPED_TITLE_KEYS = ["link", "sublink", "target", "subtarget"]

const MAX_STRING = 2_000

const TOKEN = /^\$([a-z0-9]+)(?::(0(?:\.\d+)?|1(?:\.0+)?))?$/

const hexToRgba = (hex: string, alpha: number): string => {
  const h = hex.replace("#", "")
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6)
  const n = parseInt(full, 16)
  if (!Number.isFinite(n)) return hex
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** "$positive" → the theme colour; "$positive:0.3" → with 30% opacity. */
export const resolveToken = (
  value: string,
  colors: ColorShape,
): string | null => {
  const match = TOKEN.exec(value)
  if (!match || !isTone(match[1])) return null
  const color = toneColor(match[1], colors)
  return match[2] !== undefined && color.startsWith("#")
    ? hexToRgba(color, Number(match[2]))
    : color
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isSafeImage = (value: string): boolean =>
  /^data:image\/(png|gif|jpeg|webp|svg\+xml);/i.test(value)

export type SanitizedOption = {
  option: Record<string, unknown>
  problems: OptionProblem[]
}

/** The option made safe and on-style, with what was changed and why. */
export const sanitizeOption = (
  raw: unknown,
  context: SanitizeContext,
): SanitizedOption => {
  const problems: OptionProblem[] = []
  const report = (
    path: string,
    message: string,
    severity: OptionProblem["severity"] = "warning",
  ) => {
    if (problems.length < 50) problems.push({ path, message, severity })
  }

  const plain = copyPlainOption(raw)
  if (!plain) {
    report(
      "",
      "The option must be a JSON object of plain data, at most 20,000 values deep and wide.",
      "error",
    )
    return { option: {}, problems }
  }

  const walk = (
    node: unknown,
    path: string,
    inside: { tooltip: boolean; title: boolean },
  ): unknown => {
    if (typeof node === "string") {
      if (node.length > MAX_STRING) {
        report(path, `Text longer than ${MAX_STRING} characters was cut.`)
        node = node.slice(0, MAX_STRING)
      }
      const text = node as string
      if (text.startsWith("image://")) {
        if (isSafeImage(text.slice("image://".length))) return text
        report(path, "Only data: images are allowed; the symbol is a circle.")
        return "circle"
      }
      return text
    }
    if (Array.isArray(node))
      return node.map((child, i) => walk(child, `${path}[${i}]`, inside))
    if (!isRecord(node)) return node

    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node)) {
      const at = path ? `${path}.${key}` : key
      if (key === "fontFamily") {
        report(at, "Fonts come from the console theme.")
        continue
      }
      if (inside.title && DROPPED_TITLE_KEYS.includes(key)) {
        report(at, "Links in titles are not allowed.", "error")
        continue
      }
      if (key === "tooltip" && isRecord(value)) {
        out[key] = walkTooltip(value, at)
        continue
      }
      if (
        (key === "image" || key === "backgroundImage") &&
        typeof value === "string"
      ) {
        if (isSafeImage(value)) out[key] = value
        else report(at, "Only data: images are allowed.", "error")
        continue
      }
      if (COLOR_KEYS.has(key)) {
        const color = walkColor(value, at)
        if (color !== undefined) out[key] = color
        continue
      }
      out[key] = walk(value, at, {
        ...inside,
        title: inside.title || (path === "" && key === "title"),
      })
    }
    return out
  }

  const walkTooltip = (
    tooltip: Record<string, unknown>,
    path: string,
  ): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(tooltip)) {
      const at = `${path}.${key}`
      if (DROPPED_TOOLTIP_KEYS.includes(key)) {
        report(at, "Tooltip placement and DOM options are set by the console.")
        continue
      }
      if (key === "formatter" && typeof value === "string") {
        // The template is inserted as HTML; data values are escaped by
        // ECharts, the template itself is not.
        const escaped = escapeHtml(value.slice(0, MAX_STRING))
        if (escaped !== value)
          report(at, "HTML in tooltip templates is shown as text.")
        out[key] = escaped
        continue
      }
      out[key] = walk(value, at, { tooltip: true, title: false })
    }
    return out
  }

  const walkColor = (value: unknown, path: string): unknown => {
    if (typeof value === "string") {
      const resolved = resolveToken(value, context.colors)
      if (resolved) return resolved
      if (value === "none" || value === "transparent" || value === "inherit")
        return value
      if (value === "auto") return value
      report(
        path,
        `Colours come from the theme: use a tone such as "$positive", "$negative", "$warning", "$info", "$accent", "$muted" or "$series1"…"$series8" (add ":0.3" for opacity) instead of "${value}".`,
      )
      return undefined
    }
    if (Array.isArray(value)) {
      const colors = value
        .map((v, i) => walkColor(v, `${path}[${i}]`))
        .filter((v) => v !== undefined)
      return colors.length > 0 ? colors : undefined
    }
    if (isRecord(value)) {
      // Gradients: { type: "linear", colorStops: [{ offset, color }] }
      return walk(value, path, { tooltip: false, title: false })
    }
    return undefined
  }

  const option = walk(plain, "", { tooltip: false, title: false }) as Record<
    string,
    unknown
  >

  delete option.backgroundColor
  if ("toolbox" in option) {
    delete option.toolbox
    report("toolbox", "The console provides its own chart toolbar.")
  }

  validateSeries(option, context, report)
  validateMaps(option, context, report)
  return { option, problems }
}

const validateSeries = (
  option: Record<string, unknown>,
  context: SanitizeContext,
  report: (
    path: string,
    message: string,
    severity?: "error" | "warning",
  ) => void,
) => {
  const raw = option.series
  if (raw === undefined) return
  const list = Array.isArray(raw) ? raw : [raw]
  const kept: unknown[] = []
  list.forEach((series, i) => {
    const at = `series[${i}]`
    if (!isRecord(series)) {
      report(at, "A series must be an object.", "error")
      return
    }
    const type = series.type
    if (typeof type !== "string" || !SERIES_TYPES.has(type)) {
      report(
        `${at}.type`,
        `Unknown series type ${JSON.stringify(type)}. Use one of: ${[...SERIES_TYPES].join(", ")}.`,
        "error",
      )
      return
    }
    if (type === "custom") {
      const renderItem = series.renderItem
      const registered =
        typeof renderItem === "string"
          ? context.renderItems.get(renderItem)
          : undefined
      if (!registered) {
        report(
          `${at}.renderItem`,
          `A custom series names a chart type: one of ${[...context.renderItems.keys()].join(", ") || "(none defined)"}. Define your own with define_chart_type.`,
          "error",
        )
        return
      }
      kept.push({ ...series, renderItem: registered })
      return
    }
    kept.push(series)
  })
  option.series = kept
}

const validateMaps = (
  option: Record<string, unknown>,
  context: SanitizeContext,
  report: (
    path: string,
    message: string,
    severity?: "error" | "warning",
  ) => void,
) => {
  const check = (node: unknown, path: string) => {
    const list = Array.isArray(node) ? node : node === undefined ? [] : [node]
    list.forEach((item, i) => {
      if (!isRecord(item) || item.map === undefined) return
      if (typeof item.map !== "string" || !context.maps.has(item.map)) {
        report(
          `${path}[${i}].map`,
          `Unknown map ${JSON.stringify(item.map)}. Available: ${[...context.maps].join(", ")}.`,
          "error",
        )
        item.map = [...context.maps][0]
      }
    })
  }
  check(option.geo, "geo")
  check(option.series, "series")
}
