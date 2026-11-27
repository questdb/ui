import { describe, expect, it } from "vitest"
import { hasExampleDashboards } from "./hasExampleDashboards"

const example = { id: "x", title: "X", path: "assets/examples/x.json" }

describe("hasExampleDashboards", () => {
  it("is true only for a non-empty array", () => {
    expect(hasExampleDashboards({ exampleDashboards: [example] })).toBe(true)
  })

  it("is false for missing, null, empty or malformed values", () => {
    expect(hasExampleDashboards(undefined)).toBe(false)
    expect(hasExampleDashboards({})).toBe(false)
    expect(hasExampleDashboards({ exampleDashboards: [] })).toBe(false)
    expect(
      hasExampleDashboards({ exampleDashboards: null as unknown as [] }),
    ).toBe(false)
    expect(
      hasExampleDashboards({ exampleDashboards: {} as unknown as [] }),
    ).toBe(false)
  })
})
