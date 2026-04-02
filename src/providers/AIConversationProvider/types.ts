import type { PartitionBy } from "../../utils/questdb"
import type { QueryKey } from "../../scenes/Editor/Monaco/utils"
import type { Message } from "../../utils/ai/types"
import type { TokenUsage } from "../../utils/aiAssistant"
import type { OperationHistory } from "../AIStatusProvider"

export type { QueryKey }

export type ConversationId = string

export type SchemaDisplayData = {
  tableName: string
  kind: "table" | "matview" | "view"
  partitionBy?: PartitionBy
  walEnabled?: boolean
  designatedTimestamp?: string
}

export type HealthIssueDisplayData = {
  tableName: string
  issueMessage: string
  severity: "critical" | "warning"
}

export type UserMessageDisplayType =
  | "fix_request"
  | "explain_request"
  | "ask_request"
  | "schema_explain_request"
  | "health_issue_request"

export type ConversationMessage = Message & {
  id: string
  timestamp: number
  error?: string
  sql?: string
  tokenUsage?: TokenUsage
  previousSQL?: string // SQL before this change (for diff display)
  isRejected?: boolean
  contentTimestamp?: number // When text content started streaming
  isAccepted?: boolean
  hideFromUI?: boolean
  isCompacted?: boolean
  operationHistory?: OperationHistory
  model?: string
  displayType?: UserMessageDisplayType
  displayUserMessage?: string
  displaySchemaData?: SchemaDisplayData
  displayHealthIssueData?: HealthIssueDisplayData
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
