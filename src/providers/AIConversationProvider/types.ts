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
  | "text"

export type ConversationMessage = {
  id?: string // Unique message identifier (auto-generated if not provided)
  role: "user" | "assistant"
  content: string // Full content sent to API
  timestamp: number
  error?: string // Error message if operation failed
  sql?: string | null // Current SQL after this message (null = no SQL change in this message)
  explanation?: string // Explanation for this turn
  tokenUsage?: TokenUsage // Token usage for assistant messages
  previousSQL?: string // SQL before this change (for diff display)
  isRejected?: boolean // Whether this change has been rejected
  isAccepted?: boolean // Whether this change has been accepted
  hideFromUI?: boolean // Whether to hide this message from UI (e.g., rejection messages)
  operationHistory?: OperationHistory // AI operation steps that produced this response
  // UI display fields - for cleaner presentation
  displayType?: UserMessageDisplayType // How to render this message in UI
  displaySQL?: string // SQL to show in inline editor (for fix/explain/ask requests)
  displayUserMessage?: string // User's actual message/question (for ask_request)
  displaySchemaData?: SchemaDisplayData // Schema data (for schema_explain_request)
}

export type AIConversation = {
  id: ConversationId // Stable identifier - never changes throughout conversation lifecycle
  conversationName: string // AI-generated name for the conversation
  updatedAt: number
  tableId?: number // Table ID for schema conversations - lookup fresh metadata from Redux
  bufferId: number | string | null // Can be null for schema/blank conversations
  queryKey: QueryKey | null // Single source of truth - contains query text, start/end offsets
  currentSQL: string // Current SQL with all pending changes (may differ from queryKey)
  messages: ConversationMessage[]
}

export type ChatWindowState = {
  isOpen: boolean
  activeConversationId: ConversationId | null
  isHistoryOpen?: boolean
  previousConversationId?: ConversationId | null // Chat we came from when opening history
}
