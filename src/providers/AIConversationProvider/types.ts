import type { PartitionBy } from "../../utils/questdb"
import type { QueryKey } from "../../scenes/Editor/Monaco/utils"
import type { OperationHistory } from "../AIStatusProvider"

export type { QueryKey }

export type ConversationId = string

export type TokenUsage = {
  inputTokens: number
  outputTokens: number
}

export type SchemaDisplayData = {
  tableName: string
  isMatView: boolean
  partitionBy?: PartitionBy
  walEnabled?: boolean
  designatedTimestamp?: string
}

export type UserMessageDisplayType =
  | "fix_request"
  | "explain_request"
  | "ask_request"
  | "schema_explain_request"

export type ConversationMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
  error?: string
  sql?: string
  explanation?: string
  tokenUsage?: TokenUsage // Token usage for current turn in total, including tool calls that we omit from the history after response
  previousSQL?: string // SQL before this change (for diff display)
  isRejected?: boolean
  isAccepted?: boolean
  hideFromUI?: boolean // User messages for accept/reject and compaction result are hidden
  isCompacted?: boolean // When converted to true, we include it in the history for UI, but do not send to the model anymore
  operationHistory?: OperationHistory
  // Predefined actions (Fix and Explain)
  displayType?: UserMessageDisplayType
  displayUserMessage?: string
  displaySchemaData?: SchemaDisplayData
}

export type AIConversation = {
  id: ConversationId
  conversationName: string
  messages: ConversationMessage[]
  updatedAt: number
  tableId?: number
  bufferId?: number
  queryKey?: QueryKey
  currentSQL?: string
}

export type ChatWindowState = {
  activeConversationId: ConversationId | null
  isHistoryOpen?: boolean
  previousConversationId?: ConversationId | null // For navigating back after toggling off the history view
}
