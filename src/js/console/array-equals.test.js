import { arrayEquals } from "./array-equals"

describe("arrayEquals", () => {
  const testCases = [
    [[1, 2, 3], [1, 2, 3], true],
    [[], [1], false],
  ]

  testCases.forEach(([left, right, expected]) => {
    test(`arrayEquals(${left.toString()}, ${right.toString()})`, () => {
      expect(arrayEquals(left, right)).toBe(expected)
    })
  })
})
