import { describe, expect, it } from "vitest"
import type { NotebookVariable } from "../../../../store/notebook"
import {
  createListVariable,
  createVariable,
  draftProblem,
  draftsFromVariables,
  orderDraftsByScope,
} from "./variableDrafts"

const draftsOf = (...variables: NotebookVariable[]) =>
  draftsFromVariables(variables, "notebook")

describe("draftProblem", () => {
  it("flags names that are empty, invalid, reserved or repeated", () => {
    // Given
    const drafts = draftsOf(
      createVariable("text", ""),
      createVariable("text", "1x"),
      createVariable("text", "timeFilter"),
      createVariable("text", "dup"),
      createVariable("text", "dup"),
    )

    // When
    const problems = drafts.map((_, i) => draftProblem(drafts, i))

    // Then
    expect(problems).toEqual([
      "emptyName",
      "invalidName",
      "reservedName",
      null,
      "duplicateName",
    ])
  })

  it.each([
    ["global", "notebook"],
    ["notebook", "global"],
    ["global", "global"],
    ["notebook", "notebook"],
  ] as const)(
    "rejects duplicate names across %s and %s scopes, ignoring case",
    (first, second) => {
      // Given
      const drafts = [
        ...draftsFromVariables([createVariable("text", "sym")], first),
        ...draftsFromVariables([createVariable("text", "SYM")], second),
      ]

      // When
      const problems = drafts.map((_, i) => draftProblem(drafts, i))

      // Then
      expect(problems).toEqual([null, "duplicateName"])
    },
  )

  it("flags an expression with no value and a text value that breaks the DECLARE shape", () => {
    // Given
    const empty = createVariable("expression", "a")
    const broken: NotebookVariable = {
      name: "b",
      kind: "text",
      value: "1, 2",
    }
    const drafts = draftsOf(empty, broken)

    // Then
    expect(draftProblem(drafts, 0)).toBe("emptyValue")
    expect(draftProblem(drafts, 1)).toBe("invalidShape")
  })

  it("flags a query list without a query and a custom list without values", () => {
    // Given
    const emptyQuery = createVariable("list", "q")
    const emptyValues: NotebookVariable = {
      ...createListVariable("c"),
      source: { type: "custom", entries: " " },
    }
    const drafts = draftsOf(emptyQuery, emptyValues)

    // Then
    expect(draftProblem(drafts, 0)).toBe("emptyQuery")
    expect(draftProblem(drafts, 1)).toBe("emptyValues")
  })

  it("flags a list regex that does not compile", () => {
    // Given
    const list: NotebookVariable = {
      name: "symbols",
      kind: "list",
      source: {
        type: "query",
        query: "SELECT s FROM t",
        refresh: "onLoad",
        regex: "(",
      },
      sort: "none",
      multi: false,
      includeAll: true,
      all: { mode: "list" },
      selected: "all",
    }

    // Then
    expect(draftProblem(draftsOf(list), 0)).toBe("invalidRegex")
  })
})

describe("orderDraftsByScope", () => {
  it("puts global drafts first and keeps the order inside each scope", () => {
    // Given
    const [a, b] = draftsFromVariables(
      [createVariable("text", "a"), createVariable("text", "b")],
      "notebook",
    )
    const [g] = draftsFromVariables([createVariable("text", "g")], "global")

    // When
    const ordered = orderDraftsByScope([a, g, b])

    // Then
    expect(ordered.map((d) => d.variable.name)).toEqual(["g", "a", "b"])
  })
})
