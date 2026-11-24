import { describe, expect, it } from "vitest"
import { sparklinePointsOf } from "./cellVisuals"
import { maxOf, minOf } from "../../utils/values"

const vertices = (points: string | undefined) =>
  (points ?? "").split(" ").map((pair) => pair.split(",").map(Number))

describe("sparklinePointsOf", () => {
  it("draws a long array with a bounded number of vertices, keeping its peaks", () => {
    // Given a 10,000-sample array with one spike and one dip
    const value = Array.from({ length: 10_000 }, (_, i) => Math.sin(i / 50))
    value[4321] = 9
    value[7654] = -9

    const points = vertices(sparklinePointsOf(value))

    // Then the polyline stays small enough for every visible cell
    expect(points.length).toBeLessThanOrEqual(202)
    // And it still runs end to end and reaches both extremes
    expect(points[0][0]).toBe(0)
    expect(points.at(-1)?.[0]).toBe(100)
    const ys = points.map(([, y]) => y)
    expect(minOf(ys)).toBe(1)
    expect(maxOf(ys)).toBe(19)
    expect(points.find(([, y]) => y === 1)?.[0]).toBeCloseTo(
      (4321 / 9999) * 100,
    )
  })

  it("keeps every sample of a short array and reuses the geometry of the same value", () => {
    const value = [3, 1, 2]
    expect(sparklinePointsOf(value)).toBe("0,1 50,19 100,10")
    expect(sparklinePointsOf(value)).toBe(sparklinePointsOf(value))
    expect(sparklinePointsOf([1])).toBeUndefined()
  })

  it("draws each sample at its place in the array, past NULL elements", () => {
    // Given an array whose middle samples are NULL (QuestDB sends NaN as null)
    const points = vertices(sparklinePointsOf([1, null, null, null, 5, 5]))

    // Then the samples keep their positions: 0, 4 and 5 of 0..5
    expect(points.map(([x]) => x)).toEqual([0, 80, 100])
  })
})
