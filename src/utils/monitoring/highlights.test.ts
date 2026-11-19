import { beforeAll, describe, expect, it } from "vitest"
import {
  compilePattern,
  loadRe2,
} from "../../components/ResultGrid/highlight/pattern"
import { healthHighlights } from "./highlights"

beforeAll(async () => {
  await loadRe2()
})

const statusPatterns = () =>
  healthHighlights("Table", ["Status"], []).rules.flatMap((rule) =>
    rule.kind === "value" && rule.condition.op === "matches"
      ? [compilePattern(rule.condition.pattern)!]
      : [],
  )

describe("health highlights", () => {
  it("matches server statuses regardless of case", () => {
    const [problem, warning] = statusPatterns()
    for (const value of ["Suspended", "SUSPENDED", "invalid", "Invalid"])
      expect(problem(value)).toBe(true)
    for (const value of ["refreshing", "Retrying", "Reduced parallelism"])
      expect(warning(value)).toBe(true)
    expect(problem("Active")).toBe(false)
    expect(warning("valid")).toBe(false)
  })
})
