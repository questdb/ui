import type {
  NotebookCell,
  NotebookChartType,
} from "../../../../store/notebook"

// Where a notebook's chart types are used: custom chart options name them in
// a custom series' `renderItem`.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const mapArray = (
  values: unknown[],
  map: (value: unknown) => unknown,
): unknown[] => {
  const next = values.map(map)
  return next.every((value, index) => value === values[index]) ? values : next
}

// These are the same series scopes validated by sanitizeOption.
const mapSeries = (
  option: Record<string, unknown>,
  visit: (series: unknown) => unknown,
): Record<string, unknown> => {
  const nested = (value: unknown) =>
    isRecord(value) ? mapSeries(value, visit) : value
  const series = Array.isArray(option.series)
    ? mapArray(option.series, visit)
    : visit(option.series)
  const baseOption = nested(option.baseOption)
  const options = Array.isArray(option.options)
    ? mapArray(option.options, nested)
    : option.options
  const media = Array.isArray(option.media)
    ? mapArray(option.media, (entry) => {
        if (!isRecord(entry)) return entry
        const scope = nested(entry.option)
        return scope === entry.option ? entry : { ...entry, option: scope }
      })
    : option.media
  if (
    series === option.series &&
    baseOption === option.baseOption &&
    options === option.options &&
    media === option.media
  )
    return option
  return {
    ...option,
    ...(series === option.series ? {} : { series }),
    ...(baseOption === option.baseOption ? {} : { baseOption }),
    ...(options === option.options ? {} : { options }),
    ...(media === option.media ? {} : { media }),
  }
}

const isCustomSeries = (
  s: unknown,
): s is { type: "custom"; renderItem: string } =>
  typeof s === "object" &&
  s !== null &&
  (s as { type?: unknown }).type === "custom" &&
  typeof (s as { renderItem?: unknown }).renderItem === "string"

/** The chart type names a custom option's series draw with. */
export const chartTypesUsedBy = (option: Record<string, unknown>): string[] => {
  const names = new Set<string>()
  mapSeries(option, (series) => {
    if (isCustomSeries(series)) names.add(series.renderItem)
    return series
  })
  return [...names]
}

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
  return mapSeries(option, (series) =>
    isCustomSeries(series) && renamed(series.renderItem)
      ? { ...series, renderItem: renames[series.renderItem] }
      : series,
  )
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
