export const shallowArrayEquals = <T>(
  a: readonly T[],
  b: readonly T[],
): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index])
