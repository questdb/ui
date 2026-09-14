import { describe, expect, it } from "vitest"
import type {
  NotebookCell,
  NotebookVariable,
  NotebookViewState,
} from "../../../../store/notebook"
import { inlineReferencedGlobals, referencedGlobals } from "./inlineGlobals"

const cell = (value: string): NotebookCell => ({
  id: value,
  position: 0,
  value,
})

const text = (name: string, value: string): NotebookVariable => ({
  name,
  kind: "text",
  value,
})

const queryList = (name: string, query: string): NotebookVariable => ({
  name,
  kind: "list",
  source: { type: "query", query, refresh: "onLoad" },
  sort: "none",
  multi: false,
  includeAll: true,
  all: { mode: "list" },
  selected: "all",
})

const view = (
  cells: NotebookCell[],
  variables: NotebookVariable[] = [],
): NotebookViewState => ({ cells, settings: { variables } })

describe("referencedGlobals", () => {
  it("keeps the globals that cells or local queries reference, in global order", () => {
    // Given
    const globals = [
      text("venue", "'LSE'"),
      text("pair", "'EURUSD'"),
      text("side", "'BUY'"),
    ]
    const notebook = view(
      [cell("SELECT * FROM t WHERE side = @side")],
      [queryList("pairs", "SELECT p FROM t WHERE venue = @venue")],
    )

    // When
    const included = referencedGlobals(notebook, globals)

    // Then
    expect(included.map((v) => v.name)).toEqual(["venue", "side"])
  })

  it("follows a global query that depends on an earlier global", () => {
    // Given
    const globals = [
      text("venue", "'LSE'"),
      queryList("pairs", "SELECT p FROM t WHERE venue = @venue"),
    ]
    const notebook = view([cell("SELECT * FROM t WHERE p IN @pairs")])

    // When
    const included = referencedGlobals(notebook, globals)

    // Then
    expect(included.map((v) => v.name)).toEqual(["venue", "pairs"])
  })

  it("skips a global that the notebook overrides", () => {
    // Given
    const globals = [text("venue", "'LSE'")]
    const notebook = view([cell("SELECT @venue")], [text("venue", "'NYSE'")])

    // Then
    expect(referencedGlobals(notebook, globals)).toEqual([])
  })
})

describe("inlineReferencedGlobals", () => {
  it("keeps the referenced globals apart from the notebook variables", () => {
    // Given
    const globals = [text("venue", "'LSE'")]
    const notebook = view(
      [cell("SELECT @venue, @side")],
      [text("side", "'BUY'")],
    )

    // When
    const inlined = inlineReferencedGlobals(notebook, globals)

    // Then
    expect(inlined.settings?.globals?.map((v) => v.name)).toEqual(["venue"])
    expect(inlined.settings?.variables?.map((v) => v.name)).toEqual(["side"])
  })

  it("returns the same view when nothing is referenced", () => {
    // Given
    const notebook = view([cell("SELECT 1")])

    // Then
    expect(inlineReferencedGlobals(notebook, [text("venue", "'LSE'")])).toBe(
      notebook,
    )
  })
})
