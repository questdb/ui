/** JSON has no bigint representation, so decimal strings are used only when
 * catalog data crosses back into a JSON/text boundary. */
export const stringifyWithBigInts = (
  value: unknown,
  space?: string | number,
): string =>
  JSON.stringify(
    value,
    (_key, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item,
    space,
  )
