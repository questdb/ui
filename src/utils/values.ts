// Small value helpers shared by the notebook's formats, visuals, custom
// charts and importers, so each reads a value the same way.

/** A plain object: not null and not an array. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** A finite number from a number, numeric text or a bigint; else null. */
export const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  if (typeof value === "bigint") return Number(value)
  return null
}

/** A number typed in a form field; undefined while it is empty or not one. */
export const parseNumberInput = (text: string): number | undefined => {
  const n = Number(text)
  return text.trim() === "" || !Number.isFinite(n) ? undefined : n
}
