import { describe, expect, it } from "vitest"
import {
  noticeTranscript,
  parseNoticeRecord,
  stopReasonNotice,
} from "./noticeTranscript"

describe("noticeTranscript", () => {
  it("keeps a notice as a block that reads back the same, whatever its text", () => {
    // Given
    const notice = {
      severity: "error" as const,
      title: "Hook ``` stopped the turn",
      description: "Line one\nline two",
    }

    // When
    const block = noticeTranscript(notice)
    const body = /```agent-notice\n([^]*)\n```/.exec(block)?.[1] ?? ""

    // Then
    expect(body).not.toContain("```")
    expect(parseNoticeRecord(body)).toEqual(notice)
  })

  it("reads nothing from a block that is not a notice", () => {
    expect(parseNoticeRecord("{}")).toBeNull()
    expect(parseNoticeRecord('{"severity":"loud","title":"x"}')).toBeNull()
    expect(parseNoticeRecord("not json")).toBeNull()
  })
})

describe("stopReasonNotice", () => {
  it("explains each way a turn can stop short, and nothing for a normal end", () => {
    expect(stopReasonNotice("end_turn")).toBeNull()
    expect(stopReasonNotice("cancelled")).toBeNull()
    expect(stopReasonNotice("max_tokens")?.title).toMatch(/output limit/)
    expect(stopReasonNotice("max_turn_requests")?.title).toMatch(/step limit/)
    expect(stopReasonNotice("refusal")?.title).toMatch(/declined/)
    expect(stopReasonNotice("quota")?.description).toContain("quota")
  })
})
