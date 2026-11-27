import { describe, expect, it } from "vitest"
import { findMissingVariables } from "./missingVariables"

describe("missing variables in pasted SQL", () => {
  it.each([
    ["SELECT @absent, @ABSENT, @other", [], ["absent", "other"]],
    ["SELECT @SINCE, @since", ["Since"], []],
    ["SELECT '@literal', 1 /* @block */ -- @line", [], []],
    ['SELECT "@column" FROM trades', [], []],
    ["DECLARE @local := 1 SELECT @LOCAL", [], []],
    ["DECLARE @local := @dependency SELECT @local", [], ["dependency"]],
    ["DECLARE @local := 1 SELECT @local; SELECT @local", [], ["local"]],
    ["DECLARE @first := 1, @second := @first SELECT @second", [], []],
    ["SELECT @Δvalue, @ΔVALUE", ["δvalue"], []],
  ])("checks %s", (sql, available, missing) => {
    expect(findMissingVariables(sql, available)).toEqual(missing)
  })
})
