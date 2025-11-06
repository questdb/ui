import { arrayEquals } from "./array-equals"

describe("arrayEquals", () => {
  const testCases = [
    [[1, 2, 3], [1, 2, 3], true],
    [[], [1], false],
  ] as Array<[number[], number[], boolean]>

  testCases.forEach(([left, right, expected]) => {
    test(`arrayEquals(${left.toString()}, ${right.toString()})`, () => {
      expect(arrayEquals(left, right)).toEqual(expected)
    })
  })
})
