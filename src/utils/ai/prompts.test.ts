import { describe, expect, it } from "vitest"

import { getHealthIssuePrompt } from "./prompts"

describe("getHealthIssuePrompt", () => {
  it("should preserve unsafe LONG trend samples without locale separators", () => {
    // Given
    const unsafeLong = BigInt("9007199254740993")

    // When
    const prompt = getHealthIssuePrompt({
      tableName: "trades_lv",
      issue: {
        id: "Y1",
        field: "transactionLag",
        message: "Transaction lag increasing",
      },
      tableDetails: "{}",
      monitoringDocs: "Documentation unavailable",
      trendSamples: [{ value: unsafeLong, timestamp: Date.UTC(2026, 7, 26) }],
    })

    // Then the digits reach the model unseparated, in any locale
    expect(prompt).toContain("9007199254740993")
  })

  it("includes kind-specific diagnostics and issue guidance when provided", () => {
    const prompt = getHealthIssuePrompt({
      tableName: "trades_lv",
      issue: {
        id: "R5",
        field: "viewStatus",
        message: "Live view is invalid",
      },
      tableDetails: '{"table_name":"trades_lv"}',
      diagnosticDetails: {
        source: "live_views()",
        data: '{"view_status":"invalid","writer_stall_micros":"6000000"}',
      },
      issueGuidance: "Drop and recreate the live view.",
      monitoringDocs: "Documentation unavailable",
    })

    expect(prompt).toContain("Kind-specific Details (from live_views())")
    expect(prompt).toContain('"writer_stall_micros":"6000000"')
    expect(prompt).toContain("Issue-specific Guidance")
    expect(prompt).toContain("Drop and recreate the live view.")
  })

  it("omits optional diagnostic sections for regular table issues", () => {
    const prompt = getHealthIssuePrompt({
      tableName: "trades",
      issue: {
        id: "R1",
        field: "walStatus",
        message: "WAL suspended",
      },
      tableDetails: '{"table_name":"trades"}',
      monitoringDocs: "Documentation unavailable",
    })

    expect(prompt).not.toContain("Kind-specific Details")
    expect(prompt).not.toContain("Issue-specific Guidance")
  })
})
