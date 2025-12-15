import type { QueryKey } from "../../scenes/Editor/Monaco/utils"
import type { PartitionBy } from "../../utils/questdb"

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
  | "generate_request"
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
  displayDescription?: string // Description to show (for generate_request)
  displayUserMessage?: string // User's actual message/question (for ask_request)
  displaySchemaData?: SchemaDisplayData // Schema data (for schema_explain_request)
}

export type AIConversation = {
  queryKey: QueryKey // Primary identifier - the query this conversation is for
  bufferId: number | string | undefined // The tab/buffer ID this conversation belongs to (undefined for fallback buffer)
  originalQuery?: string // Original query text (for Fix/Ask flows) or description (for Generate flow)
  initialSQL: string // Initial SQL for diff editor (empty for Generate, original SQL for Fix/Ask)
  currentSQL: string // Current SQL with all unaccepted changes
  currentExplanation: string
  acceptedSQL: string // Last accepted SQL state (initially = initialSQL)
  acceptedAt: number // Timestamp of last acceptance
  conversationName?: string // AI-generated name for the conversation
  messages: ConversationMessage[]
  createdAt: number
  updatedAt: number
  // New flow: pending diff state
  hasPendingDiff: boolean // Whether there's an unactioned diff waiting for accept/reject
  // Query position in editor - for replacement on accept
  queryStartOffset?: number // Start offset of original query in editor
  queryEndOffset?: number // End offset of original query in editor
  // Schema explanation data - cleared when conversation transitions to query generation
  schemaData?: SchemaDisplayData
}

export type ChatWindowState = {
  isOpen: boolean
  activeQueryKey: QueryKey | null // The queryKey of the conversation currently shown in chat window
}
