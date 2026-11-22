import { describe, expect, it } from "vitest"
import {
  NOTEBOOK_FORMAT_VERSION,
  copyPlainOption,
  migrateNotebookFormat,
  sanitizeChartSync,
  sanitizeChartTypes,
  sanitizeInteractions,
  sanitizeVisualConfig,
} from "./notebookFormat"

describe("migrateNotebookFormat", () => {
  it("brings a state without a version to the current one", () => {
    // Given
    const state = { cells: [] }

    // When
    const migrated = migrateNotebookFormat(state)

    // Then
    expect(migrated.newer).toBe(false)
    expect(migrated.state.formatVersion).toBe(NOTEBOOK_FORMAT_VERSION)
  })

  it("keeps a state from a newer console as it is", () => {
    // Given
    const state = { formatVersion: NOTEBOOK_FORMAT_VERSION + 1, cells: [] }

    // When
    const migrated = migrateNotebookFormat(state)

    // Then
    expect(migrated.newer).toBe(true)
    expect(migrated.state).toBe(state)
  })

  it("returns the same object when already current", () => {
    // Given
    const state = { formatVersion: NOTEBOOK_FORMAT_VERSION, cells: [] }

    // When / Then
    expect(migrateNotebookFormat(state).state).toBe(state)
  })
})

describe("sanitizers", () => {
  it("preserves an explicitly bound long query alias", () => {
    const column = "a".repeat(201)
    const interactions = { click: { variable: "selected", column } }
    expect(sanitizeInteractions(interactions)).toEqual(interactions)
  })
  it("preserves long query aliases used as visual roles", () => {
    const value = "a".repeat(201)
    for (const type of ["gauge", "stat"] as const) {
      expect(sanitizeVisualConfig({ type, columns: { value } })).toEqual({
        type,
        columns: { value },
      })
    }
  })

  it("preserves an uptime override for a long query-derived state label", () => {
    const state = "device state ".repeat(18)
    const visual = sanitizeVisualConfig({
      type: "uptime",
      severity: { [state]: "bad" },
    })
    expect(visual?.severity?.[state]).toBe("bad")
  })

  it("keeps a visual's known roles and drops unknown types", () => {
    // Given / When
    const visual = sanitizeVisualConfig({
      type: "orderBook",
      columns: { price: "px", size: "qty", bogus: "x", path: ["a", 3] },
      min: 0,
    })

    // Then
    expect(visual).toEqual({
      type: "orderBook",
      columns: { price: "px", size: "qty", path: ["a"] },
      min: 0,
    })
    expect(sanitizeVisualConfig({ type: "iframe" })).toBeUndefined()
    expect(
      sanitizeVisualConfig({
        type: "uptime",
        buckets: 9000,
        severity: { charging: "warning", idle: "purple" },
      }),
    ).toEqual({
      type: "uptime",
      buckets: 365,
      severity: { charging: "warning" },
    })
  })

  it("copies plain options and refuses functions and prototype keys", () => {
    // Given
    const option = JSON.parse(
      '{"series":[{"type":"bar"}],"__proto__":{"x":1}}',
    ) as unknown

    // When / Then
    expect(copyPlainOption(option)).toEqual({ series: [{ type: "bar" }] })
    expect(copyPlainOption({ formatter: () => "x" })).toBeUndefined()
  })

  it("accepts interactions only with valid variable names", () => {
    // Given / When / Then
    expect(
      sanitizeInteractions({ click: { variable: "symbol", column: "sym" } }),
    ).toEqual({ click: { variable: "symbol", column: "sym" } })
    expect(sanitizeInteractions({ click: { variable: "1; DROP" } })).toBe(
      undefined,
    )
  })

  it("dedupes chart types by name and drops invalid ones", () => {
    // Given / When: an imported type that claims to be allowed
    const types = sanitizeChartTypes([
      { name: "lanes", renderItem: "return null", allowed: true },
      { name: "lanes", renderItem: "return 1" },
      { name: "bad name", renderItem: "" },
    ])

    // Then it arrives not allowed: imported code waits for the user
    expect(types).toEqual([{ name: "lanes", renderItem: "return null" }])
  })

  it("drops a chart sync that does nothing", () => {
    // Given / When / Then
    expect(sanitizeChartSync({ crosshair: "off", zoom: false })).toBe(undefined)
    expect(sanitizeChartSync({ crosshair: "tooltip" })).toEqual({
      crosshair: "tooltip",
      zoom: false,
    })
  })
})
