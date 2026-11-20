import type { NotebookChartType } from "../../../../store/notebook"
import { isChartTypeName } from "../../../../store/notebookFormat"
import { compileError } from "./chartTypeCompile"

// The chart types dialog edits a draft of every type at once and saves it in
// one update. A type keeps the name it was saved under (`original`), so a
// rename also renames its uses in custom chart options.

export type ChartTypeDraft = {
  key: string
  // The saved name, or null for a type added in this draft.
  original: string | null
  name: string
  description: string
  renderItem: string
}

export const MAX_CHART_TYPES = 32
export const MAX_RENDER_ITEM_LENGTH = 20_000

export const NEW_CHART_TYPE_SOURCE = `// Draws one data item. params.dataIndex is the row; api.value(i) reads
// its i-th encoded value, api.coord([x, y]) turns values into pixels,
// api.size([dx, dy]) gives a value's size in pixels, api.visual("color")
// the series colour. Return a shape: rect, circle, line, polygon, text,
// or a group of them. Draw inside the axes.
function (params, api) {
  const [x, y] = api.coord([api.value(0), api.value(1)])
  return {
    type: "circle",
    shape: { cx: x, cy: y, r: 4 },
    style: { fill: api.visual("color") },
  }
}
`

let nextKey = 0
const keyOf = () => `type-${nextKey++}`

export const draftOfTypes = (
  types: NotebookChartType[] | undefined,
): ChartTypeDraft[] =>
  (types ?? []).map((t) => ({
    key: keyOf(),
    original: t.name,
    name: t.name,
    description: t.description ?? "",
    renderItem: t.renderItem,
  }))

/** A name not taken yet: chartType1, chartType2, … */
export const freshTypeName = (drafts: ChartTypeDraft[]): string => {
  const taken = new Set(drafts.map((d) => d.name))
  let i = 1
  while (taken.has(`chartType${i}`)) i++
  return `chartType${i}`
}

export const newTypeDraft = (drafts: ChartTypeDraft[]): ChartTypeDraft => ({
  key: keyOf(),
  original: null,
  name: freshTypeName(drafts),
  description: "",
  renderItem: NEW_CHART_TYPE_SOURCE,
})

export type ChartTypeErrors = { name?: string; source?: string }

/** What keeps a type from saving: a bad or taken name, source that won't compile. */
export const typeErrors = (
  draft: ChartTypeDraft,
  drafts: ChartTypeDraft[],
): ChartTypeErrors => {
  const errors: ChartTypeErrors = {}
  if (!isChartTypeName(draft.name))
    errors.name = "Start with a letter; use letters, digits or _ (at most 64)."
  else if (drafts.some((d) => d.key !== draft.key && d.name === draft.name))
    errors.name = "Another chart type has this name."
  if (draft.renderItem.trim() === "") errors.source = "Write the function."
  else if (draft.renderItem.length > MAX_RENDER_ITEM_LENGTH)
    errors.source = `At most ${MAX_RENDER_ITEM_LENGTH.toLocaleString("en-US")} characters.`
  else {
    const error = compileError(draft.renderItem)
    if (error) errors.source = `Does not compile: ${error}`
  }
  return errors
}

export const hasErrors = (errors: ChartTypeErrors) =>
  errors.name !== undefined || errors.source !== undefined

/** The types to save, and the renames to apply to custom options. */
export const typesToSave = (
  drafts: ChartTypeDraft[],
): { types: NotebookChartType[]; renames: Record<string, string> } => ({
  types: drafts.map((d) => ({
    name: d.name,
    renderItem: d.renderItem,
    ...(d.description.trim()
      ? { description: d.description.trim().slice(0, 500) }
      : {}),
  })),
  renames: Object.fromEntries(
    drafts
      .filter((d) => d.original !== null && d.original !== d.name)
      .map((d) => [d.original as string, d.name]),
  ),
})

/** True when the drafts differ from the saved types. */
export const typesChanged = (
  drafts: ChartTypeDraft[],
  saved: NotebookChartType[] | undefined,
): boolean =>
  JSON.stringify(typesToSave(drafts).types) !==
  JSON.stringify(
    (saved ?? []).map((t) => ({
      name: t.name,
      renderItem: t.renderItem,
      // Compared as it would save: trimmed, and absent when blank.
      ...(t.description?.trim()
        ? { description: t.description.trim().slice(0, 500) }
        : {}),
    })),
  )
