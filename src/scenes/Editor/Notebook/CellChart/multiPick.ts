// A pick of several columns made through a SearchableSelect, one toggle at a
// time.

type Option = { label: string; value: string }

/** The trigger's text: empty when nothing is picked, so the placeholder shows. */
export const summarizePicked = (value: string[], options: Option[]): string => {
  if (value.length === 0) return ""
  if (value.length === options.length && options.length > 0)
    return `All (${options.length})`
  if (value.length <= 2) return value.join(", ")
  return `${value.length} of ${options.length}`
}

/**
 * Toggles a column and keeps the options' (the query's column) order, so a
 * persisted pick stays stable across toggles.
 */
export const togglePicked = (
  value: string[],
  name: string,
  options: Option[],
): string[] => {
  if (value.includes(name)) return value.filter((v) => v !== name)
  const next = new Set([...value, name])
  return options.filter((o) => next.has(o.value)).map((o) => o.value)
}
