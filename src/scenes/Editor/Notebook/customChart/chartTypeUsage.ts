import type {
  NotebookCell,
  NotebookChartType,
} from "../../../../store/notebook"

// Where a notebook's chart types are used: custom chart options name them in
// a custom series' `renderItem`.

const seriesOf = (option: Record<string, unknown>): unknown[] =>
  Array.isArray(option.series)
    ? (option.series as unknown[])
    : option.series && typeof option.series === "object"
      ? [option.series]
      : []

const isCustomSeries = (
  s: unknown,
): s is { type: "custom"; renderItem: string } =>
  typeof s === "object" &&
  s !== null &&
  (s as { type?: unknown }).type === "custom" &&
  typeof (s as { renderItem?: unknown }).renderItem === "string"

/** The chart type names a custom option's series draw with. */
export const chartTypesUsedBy = (option: Record<string, unknown>): string[] =>
  seriesOf(option).flatMap((s) => (isCustomSeries(s) ? [s.renderItem] : []))

/** The cells whose custom option draws with chart type `name`. */
export const cellsUsingChartType = (
  cells: NotebookCell[],
  name: string,
): NotebookCell[] =>
  cells.filter((cell) => {
    const option = cell.chartConfig?.custom?.option
    return option !== undefined && chartTypesUsedBy(option).includes(name)
  })

/**
 * A custom option with its chart types renamed, old name → new, all at once
 * (so two types can swap names). The same object when nothing changes.
 */
export const renameChartTypesIn = (
  option: Record<string, unknown>,
  renames: Record<string, string>,
): Record<string, unknown> => {
  const renamed = (name: string) =>
    Object.prototype.hasOwnProperty.call(renames, name) &&
    renames[name] !== name
  if (!chartTypesUsedBy(option).some(renamed)) return option
  const rename = (s: unknown) =>
    isCustomSeries(s) && renamed(s.renderItem)
      ? { ...s, renderItem: renames[s.renderItem] }
      : s
  return {
    ...option,
    series: Array.isArray(option.series)
      ? (option.series as unknown[]).map(rename)
      : rename(option.series),
  }
}

/**
 * Chart types as an agent sends them, keeping the user's allowance for any
 * type whose code did not change: resending a type does not switch it off.
 */
export const keepAllowed = (
  next: NotebookChartType[],
  previous: NotebookChartType[] | undefined,
): NotebookChartType[] =>
  next.map((type) => {
    const before = previous?.find((t) => t.name === type.name)
    return before?.allowed === true && before.renderItem === type.renderItem
      ? { ...type, allowed: true }
      : type
  })
