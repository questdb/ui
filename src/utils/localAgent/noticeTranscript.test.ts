import { describe, expect, it } from "vitest"
import { stopReasonNotice } from "./noticeTranscript"

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
