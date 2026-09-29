import { describe, expect, it } from "vitest"
import type { NotebookVariable } from "../../../../store/notebook"
import { queryPrecheck, variablePrecheck } from "./queryChecks"

const context = { declaredAbove: ["exchange"], hasTimeRange: true }

describe("queryPrecheck", () => {
  it("accepts a single SELECT that references declared and time variables", () => {
    expect(
      queryPrecheck(
        "SELECT symbol FROM t WHERE exchange IN @exchange AND ts IN @timeFilter",
        context,
      ),
    ).toBeNull()
  })

  it("rejects an empty query and an undeclared reference", () => {
    expect(queryPrecheck("  ", context)).toContain("Write the query")
    expect(
      queryPrecheck("SELECT x FROM t WHERE x = @missing", context),
    ).toContain("@missing is not declared")
  })

  it("asks for a time range when a time variable is used without one", () => {
    expect(
      queryPrecheck("SELECT x FROM t WHERE ts IN @timeFilter", {
        declaredAbove: [],
        hasTimeRange: false,
      }),
    ).toContain("Set a time range")
  })
})

describe("variablePrecheck", () => {
  it("rejects an expression that references a variable declared below it", () => {
    // Given
    const variable: NotebookVariable = {
      name: "pair",
      kind: "expression",
      value: "@base || '-' || @quote",
    }

    // When / Then
    expect(
      variablePrecheck(variable, {
        declaredAbove: ["base"],
        hasTimeRange: false,
      }),
    ).toContain("@quote is not declared")
    expect(
      variablePrecheck(variable, {
        declaredAbove: ["base", "quote"],
        hasTimeRange: false,
      }),
    ).toBeNull()
  })
})
