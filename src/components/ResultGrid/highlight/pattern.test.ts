import { describe, expect, it, vi } from "vitest"
import type { HighlightRule } from "./types"
import { isRe2Ready, loadRe2 } from "./pattern"
import { validateRuleFields } from "./validateRule"

const re2Chunk = vi.hoisted(() => ({ reachable: false }))

vi.mock("re2js", async (importActual) => {
  if (!re2Chunk.reachable) throw new Error("chunk 404")
  return importActual()
})

const matchesRule: HighlightRule = {
  id: "r1",
  kind: "value",
  enabled: true,
  display: "always",
  target: { kind: "column", name: "sym" },
  appliesTo: "cell",
  condition: { op: "matches", pattern: "^EUR" },
  color: "dataSeries2",
}

describe("loadRe2", () => {
  it("fails pattern validation while the engine cannot load, then recovers", async () => {
    // Given the re2js chunk is unreachable
    re2Chunk.reachable = false

    // When loading and validating a matches rule
    const failed = await loadRe2()
    const errorsWhileDown = validateRuleFields(matchesRule, "unknown")

    // Then the load reports failure and the pattern field carries it
    expect(failed).toBe(false)
    expect(isRe2Ready()).toBe(false)
    expect(errorsWhileDown).toEqual({ pattern: "Could not load regex engine" })

    // When the chunk becomes reachable and the load is retried
    re2Chunk.reachable = true
    const recovered = await loadRe2()
    const errorsAfterLoad = validateRuleFields(matchesRule, "unknown")

    // Then the engine is ready and the same rule passes
    expect(recovered).toBe(true)
    expect(isRe2Ready()).toBe(true)
    expect(errorsAfterLoad).toEqual({})
  })
})
