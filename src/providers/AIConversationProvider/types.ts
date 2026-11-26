import type { AgentPromptImage } from "../../utils/localAgent/protocol"
import type { PartitionBy, TableKind } from "../../utils/questdb"
import type { QueryKey } from "../../scenes/Editor/Monaco/utils"
import type { Message } from "../../utils/ai/types"
import type { RanStatus } from "../../utils/ai/runStatus"
import type { AutoRefresh } from "../../store/notebook"
import type { ContextUsage, TokenUsage } from "../../utils/ai/aiAssistant"
import type { OperationHistory } from "../AIStatusProvider"

export type ConversationId = string

export type SchemaDisplayData = {
  tableName: string
  kind: TableKind
  partitionBy?: PartitionBy
  walEnabled?: boolean
  designatedTimestamp?: string
}

export type HealthIssueDisplayData = {
  tableName: string
  issueMessage: string
  severity: "critical" | "warning"
}

// Requests the chat shows from their display data, not from their content.
export const USER_MESSAGE_DISPLAY_TYPES = [
  "fix_request",
  "explain_request",
  "ask_request",
  "schema_explain_request",
  "health_issue_request",
] as const

export type UserMessageDisplayType = (typeof USER_MESSAGE_DISPLAY_TYPES)[number]

export type ConversationMessage = Message & {
  id: string
  timestamp: number
  error?: string
  sql?: string
  tokenUsage?: TokenUsage
  // How full the model's context was after this answer.
  contextUsage?: ContextUsage
  // Images the user attached to this message, for an agent that reads them.
  images?: AgentPromptImage[]
  // The message is one of the agent's own commands, sent as typed.
  agentCommand?: boolean
  previousSQL?: string // SQL before this change (for diff display)
  isRejected?: boolean
  contentTimestamp?: number // When text content started streaming
  isAccepted?: boolean
  hideFromUI?: boolean
  isCompacted?: boolean
  operationHistory?: OperationHistory
  model?: string
  // Wall-clock time for the whole assistant turn, stored on its anchor.
  turnDurationMs?: number
  // Legacy agent type marker; it does not identify a session.
  localAgentId?: string
  // Set on regular chat turns that handed their earlier history to this session.
  localAgentSessionId?: string
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
  // 1:1 notebook binding — persists via Dexie, never auto-cleared.
  notebookBufferId?: number
}

// Coalesced user-action summary since the last assistant turn — see applyUserActionToDigest for fold rules.
export type UserActionDigest = {
  added: Set<string>
  deleted: Set<string>
  edited: Set<string>
  ran: Map<string, RanStatus>
  layoutModeTo?: "list" | "grid"
  autoRefreshDefaultTo?: AutoRefresh
  notebookStatusChange?: "archived" | "deleted"
}

export type ChatWindowState = {
  activeConversationId: ConversationId | null
  isHistoryOpen?: boolean
  previousConversationId?: ConversationId | null // For navigating back after toggling off the history view
}
