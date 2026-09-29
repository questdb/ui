import { describe, expect, it } from "vitest"
import type { NotebookVariable } from "../../../../store/notebook"
import { variableSuggestions } from "./variableSuggestions"

describe("variableSuggestions", () => {
  it("lists the time built-ins first, then globals, then locals, each with its current value", () => {
    // Given
    const globals: NotebookVariable[] = [
      { name: "venue", kind: "text", value: "'LSE'", description: "Venue" },
      { name: "pair", kind: "text", value: "'EURUSD'" },
    ]
    const local: NotebookVariable[] = [
      { name: "local_pair", kind: "text", value: "'GBPUSD'" },
      { name: "side", kind: "text", value: "" },
    ]
    const entries = [
      { name: "timeTo", value: "now()" },
      { name: "timeFrom", value: "dateadd('h', -1, @timeTo)" },
      { name: "timeFilter", value: "interval(@timeFrom, @timeTo)" },
      { name: "venue", value: "'LSE'" },
      { name: "pair", value: "'EURUSD'" },
      { name: "local_pair", value: "'GBPUSD'" },
    ]

    // When
    const suggestions = variableSuggestions(globals, local, entries)

    // Then
    expect(suggestions).toEqual([
      { name: "timeTo", value: "now()", description: "Time range" },
      {
        name: "timeFrom",
        value: "dateadd('h', -1, @timeTo)",
        description: "Time range",
      },
      {
        name: "timeFilter",
        value: "interval(@timeFrom, @timeTo)",
        description: "Time range",
      },
      { name: "venue", value: "'LSE'", description: "Venue" },
      { name: "pair", value: "'EURUSD'", description: "All notebooks" },
      { name: "local_pair", value: "'GBPUSD'", description: "This notebook" },
      { name: "side", value: undefined, description: "This notebook" },
    ])
  })
})
