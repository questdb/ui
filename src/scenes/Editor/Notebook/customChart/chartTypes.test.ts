import { describe, expect, it, vi } from "vitest"
import type { NotebookCell } from "../../../../store/notebook"
import {
  cellsUsingChartType,
  chartTypesUsedBy,
  keepAllowed,
  renameChartTypesIn,
} from "./chartTypeUsage"
import { resolveChartTypes } from "./chartTypeRegistry"
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

  it("tracks and renames chart types in base, timeline and media options", () => {
    // Given the same chart type used in several ECharts option scopes
    const keep = { series: { type: "line" } }
    const marker = { type: "custom", renderItem: "before" }
    const option = {
      baseOption: { series: [marker] },
      options: [{ series: marker }, keep],
      media: [{ query: { maxWidth: 400 }, option: { series: [marker] } }],
    }

    // When the type is renamed
    const next = renameChartTypesIn(option, { before: "after" })

    // Then all uses point at the new name, without replacing unrelated options
    expect(chartTypesUsedBy(option)).toEqual(["before"])
    expect(next).toEqual({
      baseOption: { series: [{ ...marker, renderItem: "after" }] },
      options: [{ series: { ...marker, renderItem: "after" } }, keep],
      media: [
        {
          query: { maxWidth: 400 },
          option: { series: [{ ...marker, renderItem: "after" }] },
        },
      ],
    })
    expect((next.options as unknown[])[1]).toBe(keep)
    expect(chartTypesUsedBy(next)).toEqual(["after"])
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
  it("checks a source without running any of it", () => {
    // Given a source whose expression has side effects
    const ran = vi.fn()
    ;(globalThis as { __ranChartType?: () => void }).__ranChartType = ran

    // When
    const error = compileError(
      "function () {}, globalThis.__ranChartType(), function (p, a) {}",
    )

    // Then it parses, and nothing ran
    expect(error).toBeNull()
    expect(ran).not.toHaveBeenCalled()
  })

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

describe("chart types allowed to run", () => {
  it("compiles and registers only allowed types", () => {
    // Given one allowed type and one waiting for the user
    const ran = vi.fn()
    ;(globalThis as { __ranWaiting?: () => void }).__ranWaiting = ran

    // When
    const resolution = resolveChartTypes(42, [
      {
        name: "allowedType",
        renderItem: "function (p, a) { return null }",
        allowed: true,
      },
      {
        name: "waiting",
        renderItem:
          "function () {}, globalThis.__ranWaiting(), function (p, a) {}",
      },
    ])

    // Then the waiting one never ran and says why
    expect(ran).not.toHaveBeenCalled()
    expect(resolution.renderItems.has("allowedType")).toBe(true)
    expect(resolution.renderItems.has("waiting")).toBe(false)
    expect(resolution.errors.get("waiting")).toMatch(/not allowed to run/)
  })

  it("keeps the user's allowance when an agent resends the same code", () => {
    // Given an allowed type
    const previous = [{ name: "a", renderItem: "return null", allowed: true }]

    // When an agent sends it back unchanged, and once changed
    const same = keepAllowed(
      [{ name: "a", renderItem: "return null" }],
      previous,
    )
    const changed = keepAllowed(
      [{ name: "a", renderItem: "return 1", allowed: false }],
      previous,
    )

    // Then
    expect(same[0].allowed).toBe(true)
    expect(changed[0].allowed).toBe(false)
  })
})
