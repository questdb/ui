export const round = (value: number, nth: number = 2) =>
  Math.round((value + Number.EPSILON) * 10 ** nth) / 10 ** nth
