import type { AgentNoticeSeverity } from "./protocol"

export type NoticeRecord = {
  severity: AgentNoticeSeverity
  title: string
  description: string | null
}

// Why a turn that did not end normally ended, for the user; null for a turn
// that ended as it should.
export const stopReasonNotice = (stopReason: string): NoticeRecord | null => {
  switch (stopReason) {
    case "end_turn":
    case "cancelled":
      return null
    case "max_tokens":
      return {
        severity: "warning",
        title: "The agent reached its output limit",
        description:
          "Its answer may be cut off. Ask it to continue where it stopped.",
      }
    case "max_turn_requests":
      return {
        severity: "warning",
        title: "The agent reached its step limit",
        description: "It stopped before finishing. Ask it to continue.",
      }
    case "refusal":
      return {
        severity: "warning",
        title: "The agent declined to continue",
        description: "Try rephrasing the request, or start a new chat.",
      }
    default:
      return {
        severity: "info",
        title: "The agent stopped",
        description: `It gave this reason: ${stopReason}.`,
      }
  }
}
