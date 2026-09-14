import { describe, expect, it } from "vitest"
import type { NotebookVariable } from "../../../../store/notebook"
import { effectiveVariables } from "./scope"

const text = (name: string, value: string): NotebookVariable => ({
  name,
  kind: "text",
  value,
})

describe("effectiveVariables", () => {
  it("lists globals first and drops a global that the notebook overrides", () => {
    // Given
    const globals = [text("pair", "'EURUSD'"), text("venue", "'LSE'")]
    const local = [text("side", "'BUY'"), text("pair", "'GBPUSD'")]

    // When
    const effective = effectiveVariables(globals, local)

    // Then
    expect(
      effective.map(({ variable, scope }) => `${scope}:${variable.name}`),
    ).toEqual(["global:venue", "notebook:side", "notebook:pair"])
    expect(effective[2].variable).toEqual(text("pair", "'GBPUSD'"))
  })
})
