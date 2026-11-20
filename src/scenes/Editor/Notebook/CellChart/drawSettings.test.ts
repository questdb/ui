import { describe, expect, it } from "vitest"
import {
  draftOf,
  kindOf,
  parseCustomJson,
  settingsOf,
  starterCustomOption,
} from "./drawSettings"
import type { ChartConfig } from "./chartTypes"
import { VISUAL_TYPES } from "./chartTypes"
import { VISUAL_CATALOG } from "../visuals/visualCatalog"

const preset: ChartConfig = {
  xColumn: "ts",
  queries: [{ type: "line", yColumns: ["price"] }],
}

describe("draw settings", () => {
  it("keeps a component through the drawer: the saved visual is in the draft and saved back", () => {
    // Given a cell drawn as a gauge
    const saved = {
      chartConfig: { ...preset, visual: { type: "gauge" as const, max: 10 } },
      formats: { price: { decimals: 2 } },
    }

    // When the drawer opens and saves without changes
    const draft = draftOf(saved, preset)
    const result = settingsOf(draft)

    // Then the gauge, the preset and the formats are all still there
    expect(draft.kind).toBe("component")
    expect(result).toEqual({
      ok: true,
      settings: {
        chartConfig: { ...preset, visual: { type: "gauge", max: 10 } },
        formats: { price: { decimals: 2 } },
      },
    })
  })

  it("saves only the chosen kind, and keeps the preset for switching back", () => {
    // Given a custom chart
    const saved = {
      chartConfig: { ...preset, custom: { option: { series: [] } } },
    }
    const draft = draftOf(saved, preset)

    // When the user picks the preset chart again
    const result = settingsOf({ ...draft, kind: "chart" })

    // Then the custom option is gone and the preset stays
    expect(kindOf(saved.chartConfig)).toBe("custom")
    expect(result).toEqual({ ok: true, settings: { chartConfig: preset } })
  })

  it("does not save a custom option that is not a JSON object", () => {
    // Given / When / Then
    const draft = draftOf({ chartConfig: preset }, preset)
    expect(
      settingsOf({ ...draft, kind: "custom", customJson: "{ nope" }),
    ).toMatchObject({ ok: false })
    expect(parseCustomJson("[1, 2]")).toMatchObject({ ok: false })
    expect(parseCustomJson('{"series": []}')).toEqual({
      ok: true,
      option: { series: [] },
    })
  })

  it("starts a custom option from the chart the cell draws", () => {
    // Given
    const statements = [
      {
        index: 0,
        columns: [
          { name: "ts", type: "TIMESTAMP" },
          { name: "price", type: "DOUBLE" },
        ],
      },
    ]

    // When
    const option = starterCustomOption(preset, statements)

    // Then
    expect(option).toMatchObject({
      xAxis: { type: "time" },
      series: [
        {
          type: "line",
          datasetId: "q0",
          encode: { x: "ts", y: "price" },
        },
      ],
    })
  })

  it("starts a pie as a pie, and stacked bars stacked", () => {
    // Given
    const statements = [
      {
        index: 0,
        columns: [
          { name: "venue", type: "SYMBOL" },
          { name: "volume", type: "DOUBLE" },
        ],
      },
    ]
    const as = (type: "pie" | "stackedBar") => ({
      xColumn: "venue",
      queries: [{ type, yColumns: ["volume"] }],
    })

    // When / Then
    expect(starterCustomOption(as("pie"), statements)).toMatchObject({
      series: [
        {
          type: "pie",
          datasetId: "q0",
          encode: { itemName: "venue", value: "volume" },
        },
      ],
    })
    expect(starterCustomOption(as("stackedBar"), statements)).toMatchObject({
      series: [{ type: "bar", stack: "total" }],
    })
  })

  it("describes every component type in the settings catalog", () => {
    // Given / When / Then
    expect(VISUAL_CATALOG.map((s) => s.type).sort()).toEqual(
      [...VISUAL_TYPES].sort(),
    )
  })

  it("does not freeze inferred chart settings into a component cell", () => {
    // Given a component saved with no preset of its own
    const saved = {
      chartConfig: {
        xColumn: null,
        queries: [],
        visual: { type: "stat" as const },
      },
    }

    // When the drawer saves without touching the chart
    const result = settingsOf(draftOf(saved, preset))

    // Then the preset stays empty, so it keeps following the SQL
    expect(result).toEqual({
      ok: true,
      settings: {
        chartConfig: { xColumn: null, queries: [], visual: { type: "stat" } },
      },
    })
  })
})
