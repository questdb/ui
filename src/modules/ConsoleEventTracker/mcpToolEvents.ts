import { ConsoleEvent } from "./events"
import {
  INVALID_BUFFER_ID_MESSAGE,
  STATE_NOT_FETCHED_MESSAGE,
  STATE_STALE_MESSAGE,
} from "../../utils/notebooks/notebookToolMessages"
import { mcpTools } from "../../utils/tools/tools"
import type { Permissions } from "../../utils/tools/permissions"

export type McpDeniedReasonCode =
  | "schema_access"
  | "write_sql"
  | "draw_write"
  | "classify_failed"
  | "stale"
  | "not_fetched"
  | "invalid_buffer_id"

export type McpToolResultLike = {
  content: Array<{ type: string; text?: string }>
  isError?: boolean
}

const CONSOLE_EVENT_VALUES = new Set<string>(Object.values(ConsoleEvent))
const MCP_TOOL_NAMES = new Set(mcpTools.map((tool) => tool.name))

export const mcpToolCallEvent = (toolName: string): ConsoleEvent | null => {
  if (!MCP_TOOL_NAMES.has(toolName)) return null
  const candidate = `mcp.${toolName}`
  return CONSOLE_EVENT_VALUES.has(candidate)
    ? (candidate as ConsoleEvent)
    : null
}

const SCHEMA_ACCESS_DENY_MARKER = "requires the 'grantSchemaAccess' permission"
const WRITE_SQL_DENY_MARKER = "(write operation)"
const DRAW_WRITE_DENY_PREFIX = "Cannot draw a write query"
const CLASSIFY_FAILED_DENY_PREFIX = "Cannot classify cell SQL"

const firstText = (result: McpToolResultLike): string => {
  for (const item of result.content) {
    if (item.type === "text" && typeof item.text === "string") return item.text
  }
  return ""
}

export const classifyToolResult = (
  result: McpToolResultLike,
): {
  outcome: "ok" | "tool_error" | "denied"
  reasonCode?: McpDeniedReasonCode
} => {
  const text = firstText(result)
  if (text.startsWith(STATE_STALE_MESSAGE)) {
    return { outcome: "denied", reasonCode: "stale" }
  }
  if (text.startsWith(STATE_NOT_FETCHED_MESSAGE)) {
    return { outcome: "denied", reasonCode: "not_fetched" }
  }
  if (text.startsWith(INVALID_BUFFER_ID_MESSAGE)) {
    return { outcome: "denied", reasonCode: "invalid_buffer_id" }
  }
  if (text.startsWith("PERMISSION_DENIED")) {
    if (text.includes(SCHEMA_ACCESS_DENY_MARKER)) {
      return { outcome: "denied", reasonCode: "schema_access" }
    }
    if (text.includes(WRITE_SQL_DENY_MARKER)) {
      return { outcome: "denied", reasonCode: "write_sql" }
    }
    return { outcome: "denied" }
  }
  if (text.startsWith(DRAW_WRITE_DENY_PREFIX)) {
    return { outcome: "denied", reasonCode: "draw_write" }
  }
  if (text.startsWith(CLASSIFY_FAILED_DENY_PREFIX)) {
    return { outcome: "denied", reasonCode: "classify_failed" }
  }
  return result.isError ? { outcome: "tool_error" } : { outcome: "ok" }
}

export const applyNotebookStateLayoutMode = (
  input: unknown,
): Record<string, unknown> => {
  const layoutMode = (input as { layout_mode?: unknown } | null | undefined)
    ?.layout_mode
  return layoutMode === "list" || layoutMode === "grid" ? { layoutMode } : {}
}

export const permissionLevelOf = (
  perms: Permissions,
): "write" | "read" | "schema" | "none" =>
  perms.write
    ? "write"
    : perms.read
      ? "read"
      : perms.grantSchemaAccess
        ? "schema"
        : "none"
