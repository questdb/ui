import { AIOperationStatus } from "../AIStatusProvider"
import type { ConversationMessage } from "./types"

export function getMessageContent(message: ConversationMessage): string {
  if (message.role === "user") return message.content ?? ""

  const fromHistory = message.operationHistory
    ?.filter((op) => op.type === AIOperationStatus.GeneratingResponse)
    .map((op) => op.content ?? "")
    .filter(Boolean)
    .join("\n\n")

  return fromHistory || message.content || ""
}
