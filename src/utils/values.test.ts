import { maxOf, minOf } from "./values"

describe("maxOf / minOf", () => {
  it("match Math.max/Math.min of a spread, edge cases included", () => {
    const cases: number[][] = [
      [],
      [3],
      [1, 5, -2],
      [1, NaN, 5],
      [-0, 0],
      [0, -0],
      [-Infinity, Infinity],
    ]
    for (const values of cases) {
      // eslint-disable-next-line no-restricted-syntax -- the reference
      expect(Object.is(maxOf(values), Math.max(...values))).toBe(true)
      // eslint-disable-next-line no-restricted-syntax -- the reference
      expect(Object.is(minOf(values), Math.min(...values))).toBe(true)
    }
  })

  it("read any iterable", () => {
    expect(
      maxOf(
        new Map([
          ["a", 2],
          ["b", 7],
        ]).values(),
      ),
    ).toBe(7)
    expect(minOf(new Set([4, -1, 9]))).toBe(-1)
  })

  it("take more values than a spread call allows", () => {
    const many = Array.from({ length: 300_000 }, (_, i) => i)
    expect(maxOf(many)).toBe(299_999)
    expect(minOf(many)).toBe(0)
  })
})
