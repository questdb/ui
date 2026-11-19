import { describe, expect, it } from "vitest"
import type { NotebookCell } from "../../../../store/notebook"
import {
  cellsUsingChartType,
  chartTypesUsedBy,
  renameChartTypesIn,
} from "./chartTypeUsage"
import {
  draftOfTypes,
  newTypeDraft,
  typeErrors,
  typesChanged,
  typesToSave,
} from "./chartTypesDraft"
import { compileError } from "./chartTypeRegistry"
import { setChartTypesTransition } from "../../../../utils/notebooks/notebookController/notebookTransitions"

const customCell = (id: string, renderItems: string[]): NotebookCell =>
  ({
    id,
    value: "SELECT 1",
    position: 0,
    chartConfig: {
      xColumn: null,
      queries: [],
      custom: {
        option: {
          series: renderItems.map((r) => ({ type: "custom", renderItem: r })),
        },
      },
    },
  }) as unknown as NotebookCell

describe("chart type usage", () => {
  it("finds the chart types a custom option draws with", () => {
    // Given / When / Then
    expect(
      chartTypesUsedBy({
        series: [
          { type: "custom", renderItem: "glyph" },
          { type: "line" },
          { type: "custom", renderItem: "barRange" },
        ],
      }),
    ).toEqual(["glyph", "barRange"])
    expect(
      chartTypesUsedBy({ series: { type: "custom", renderItem: "one" } }),
    ).toEqual(["one"])
  })

  it("names the cells that use a type", () => {
    // Given
    const cells = [customCell("a", ["glyph"]), customCell("b", ["other"])]

    // When / Then
    expect(cellsUsingChartType(cells, "glyph").map((c) => c.id)).toEqual(["a"])
  })

  it("renames all at once, so two types can swap names", () => {
    // Given
    const option = {
      series: [
        { type: "custom", renderItem: "a" },
        { type: "custom", renderItem: "b" },
      ],
    }

    // When
    const renamed = renameChartTypesIn(option, { a: "b", b: "a" })

    // Then
    expect(renamed.series).toEqual([
      { type: "custom", renderItem: "b" },
      { type: "custom", renderItem: "a" },
    ])
    expect(renameChartTypesIn(option, { c: "d" })).toBe(option)
  })

  it("saves the types and renames their uses in one step", () => {
    // Given a notebook whose cell draws with "glyph"
    const parts = {
      cells: [customCell("a", ["glyph"]), customCell("b", ["keep"])],
      settings: { chartTypes: [{ name: "glyph", renderItem: "return null" }] },
      maximizedCellId: null,
      focusedCellId: null,
    }

    // When it is renamed to "battery"
    const { parts: next } = setChartTypesTransition(
      parts as never,
      [{ name: "battery", renderItem: "return null" }],
      { glyph: "battery" },
    )

    // Then
    expect(next.settings.chartTypes?.map((t) => t.name)).toEqual(["battery"])
    expect(chartTypesUsedBy(next.cells[0].chartConfig!.custom!.option)).toEqual(
      ["battery"],
    )
    expect(next.cells[1]).toBe(parts.cells[1])
  })
})

describe("chart types draft", () => {
  it("accepts comments above a function", () => {
    // Given / When / Then
    expect(
      compileError("// draws a dot\nfunction (params, api) { return null }"),
    ).toBeNull()
    expect(compileError(newTypeDraft([]).renderItem)).toBeNull()
    expect(
      compileError("function (params, api) { return null }\n// the end"),
    ).toBeNull()
  })

  it("says what keeps a type from saving", () => {
    // Given
    const drafts = draftOfTypes([
      { name: "glyph", renderItem: "return null" },
      { name: "other", renderItem: "return null" },
    ])

    // When / Then
    expect(typeErrors({ ...drafts[0], name: "9bad" }, drafts).name).toMatch(
      /Start with a letter/,
    )
    expect(typeErrors({ ...drafts[0], name: "other" }, drafts).name).toMatch(
      /Another chart type/,
    )
    expect(
      typeErrors({ ...drafts[0], renderItem: "return (" }, drafts).source,
    ).toMatch(/^Does not compile/)
    expect(typeErrors(drafts[0], drafts)).toEqual({})
  })

  it("saves renames by the name each type was saved under", () => {
    // Given a renamed type and a new one
    const drafts = draftOfTypes([{ name: "glyph", renderItem: "return null" }])
    const edited = [
      { ...drafts[0], name: "battery", description: "  Icons  " },
      newTypeDraft(drafts),
    ]

    // When
    const { types, renames } = typesToSave(edited)

    // Then
    expect(types.map((t) => t.name)).toEqual(["battery", "chartType1"])
    expect(types[0].description).toBe("Icons")
    expect(renames).toEqual({ glyph: "battery" })
    expect(
      typesChanged(edited, [{ name: "glyph", renderItem: "return null" }]),
    ).toBe(true)
    expect(
      typesChanged(drafts, [{ name: "glyph", renderItem: "return null" }]),
    ).toBe(false)
    // A saved description with stray spaces is not an edit
    const spaced = [
      { name: "glyph", renderItem: "return null", description: "Dots " },
    ]
    expect(typesChanged(draftOfTypes(spaced), spaced)).toBe(false)
  })
})
