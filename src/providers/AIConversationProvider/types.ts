import type { PartitionBy } from "../../utils/questdb"
import type { QueryKey } from "../../scenes/Editor/Monaco/utils"

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
  | "text"

export type ConversationMessage = {
  role: "user" | "assistant"
  content: string // Full content sent to API
  timestamp: number
  sql?: string | null // Current SQL after this message (null = no SQL change in this message)
  explanation?: string // Explanation for this turn
  tokenUsage?: TokenUsage // Token usage for assistant messages
  previousSQL?: string // SQL before this change (for diff display)
  isRejectable?: boolean // Whether this change can be rejected (only latest change)
  isRejected?: boolean // Whether this change has been rejected
  isAccepted?: boolean // Whether this change has been accepted
  isRejectedWithFollowUp?: boolean // Whether this suggestion was implicitly rejected by sending a follow-up
  hideFromUI?: boolean // Whether to hide this message from UI (e.g., rejection messages)
  // UI display fields - for cleaner presentation
  displayType?: UserMessageDisplayType // How to render this message in UI
  displaySQL?: string // SQL to show in inline editor (for fix/explain/ask requests)
  displayUserMessage?: string // User's actual message/question (for ask_request)
  displaySchemaData?: SchemaDisplayData // Schema data (for schema_explain_request)
}

export type AIConversation = {
  id: ConversationId // Stable identifier - never changes throughout conversation lifecycle
  queryKey: QueryKey | null // Can be null for blank/orphaned conversations
  bufferId: number | string | null // Can be null for schema/blank conversations
  currentSQL: string // Current SQL with all pending changes
  acceptedSQL: string // Last accepted SQL state (what's currently in editor)
  conversationName?: string // AI-generated name for the conversation
  messages: ConversationMessage[]
  createdAt: number
  updatedAt: number
  // Query position in editor - for replacement on accept
  queryStartOffset?: number // Start offset of original query in editor
  queryEndOffset?: number // End offset of original query in editor
  // Schema identification (for schema conversations - enables reopening same table's conversation)
  schemaIdentifier?: string // Format: "schema:tableName:ddlHash" - stable for reopening
  // Schema explanation data - cleared when conversation transitions to query generation
  schemaData?: SchemaDisplayData
}

export type ChatWindowState = {
  isOpen: boolean
  activeConversationId: ConversationId | null // The ID of the conversation currently shown in chat window
}
