import { isRecord } from "../../../../utils/values"

// Where an ECharts option, once its rows are bound, could leave the chart:
// open a page (title links, and treemap/sunburst links ECharts inherits from
// the series and its levels into every node), run HTML (tooltips rendered as
// HTML, and the tooltip DOM options), or load from the network (image
// symbols, `image` and `backgroundImage` URLs). One pass over the option that
// is drawn makes each of them safe, whether the value came from the option or
// from a bound row.
//
// The rule is by sink, not by key name: `target` is a navigation target in a
// title, but the target node of a Sankey or graph link.

export const isSafeImage = (value: string): boolean =>
  /^data:image\/(png|gif|jpeg|webp|svg\+xml);/i.test(value)

type Report = (
  path: string,
  message: string,
  severity?: "error" | "warning",
) => void

const NAVIGATION = new Set(["link", "sublink", "target", "subtarget"])

// Tooltip options that place it in the page's DOM or style it with CSS.
const TOOLTIP_DOM = new Set([
  "extraCssText",
  "className",
  "appendTo",
  "appendToBody",
  "enterable",
])

const TREE_SERIES = new Set(["treemap", "sunburst"])

const IMAGE_PREFIX = "image://"

/**
 * The option with every sink made safe, and what was changed. `dataset` at
 * the root holds data, shown as text, and is left as it is.
 */
export const enforceSinks = (
  option: Record<string, unknown>,
  report: Report,
): Record<string, unknown> => {
  const walk = (node: unknown, path: string, navigation: boolean): unknown => {
    if (typeof node === "string") {
      if (
        node.startsWith(IMAGE_PREFIX) &&
        !isSafeImage(node.slice(IMAGE_PREFIX.length))
      ) {
        report(path, "Only data: images are allowed; the symbol is a circle.")
        return "circle"
      }
      return node
    }
    if (Array.isArray(node))
      return node.map((child, i) => walk(child, `${path}[${i}]`, navigation))
    if (!isRecord(node)) return node
    const tree = typeof node.type === "string" && TREE_SERIES.has(node.type)
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node)) {
      const at = path ? `${path}.${key}` : key
      if (path === "" && key === "dataset") {
        out[key] = value
        continue
      }
      // The root is where a title falls back to for its link.
      if ((navigation || tree || path === "") && NAVIGATION.has(key)) {
        report(at, "Links are not allowed.", "error")
        continue
      }
      if (key === "tooltip") {
        const tooltip = tooltipOf(value, at)
        if (tooltip !== undefined) out[key] = tooltip
        continue
      }
      if (
        (key === "image" || key === "backgroundImage") &&
        typeof value === "string" &&
        !isSafeImage(value)
      ) {
        report(at, "Only data: images are allowed.", "error")
        continue
      }
      out[key] = walk(
        value,
        at,
        navigation ||
          key === "title" ||
          (tree && (key === "data" || key === "levels")),
      )
    }
    return out
  }

  // ECharts renders a tooltip as HTML unless told otherwise: every tooltip
  // is drawn as rich text, so a template or a bound value is never HTML.
  const tooltipOf = (value: unknown, path: string): unknown => {
    if (value === false) return false
    if (typeof value === "string")
      return { formatter: value, renderMode: "richText" }
    if (Array.isArray(value))
      return value
        .map((child, i) => tooltipOf(child, `${path}[${i}]`))
        .filter((child) => child !== undefined)
    if (!isRecord(value)) return undefined
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (TOOLTIP_DOM.has(key)) {
        report(
          `${path}.${key}`,
          "Tooltip placement and DOM options are set by the console.",
        )
        continue
      }
      if (key === "renderMode") continue
      out[key] = walk(child, `${path}.${key}`, false)
    }
    return { ...out, renderMode: "richText" }
  }

  return walk(option, "", false) as Record<string, unknown>
}
