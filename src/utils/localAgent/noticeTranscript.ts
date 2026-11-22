import type { AgentNoticeSeverity } from "./protocol"

// The language of the fenced block that renders a notice in the transcript.
export const NOTICE_RECORD_LANGUAGE = "agent-notice"

export type NoticeRecord = {
  severity: AgentNoticeSeverity
  title: string
  description: string | null
}

const SEVERITIES: ReadonlySet<string> = new Set(["info", "warning", "error"])

export const noticeTranscript = (notice: NoticeRecord): string => {
  // Backticks are escaped so that the text cannot close the fence.
  const json = JSON.stringify(notice).replace(/`/g, "\\u0060")
  return `\n\n\`\`\`${NOTICE_RECORD_LANGUAGE}\n${json}\n\`\`\`\n\n`
}

export const parseNoticeRecord = (text: string): NoticeRecord | null => {
  try {
    const parsed = JSON.parse(text) as Partial<NoticeRecord> | null
    if (
      !parsed ||
      typeof parsed.title !== "string" ||
      !SEVERITIES.has(parsed.severity ?? "")
    )
      return null
    return {
      severity: parsed.severity as AgentNoticeSeverity,
      title: parsed.title,
      description:
        typeof parsed.description === "string" ? parsed.description : null,
    }
  } catch {
    return null
  }
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
