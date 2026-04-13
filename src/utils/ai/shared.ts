import type { ModelToolsClient, StatusCallback } from "../aiAssistant"
import { AIOperationStatus } from "../../providers/AIStatusProvider"
import {
  getQuestDBTableOfContents,
  getSpecificDocumentation,
  parseDocItems,
  DocCategory,
} from "../questdbDocsRetrieval"
import { jsonrepair } from "jsonrepair"

export class RefusalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RefusalError"
  }
}

export class MaxTokensError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MaxTokensError"
  }
}

export class StreamingError extends Error {
  constructor(
    message: string,
    public readonly errorType: "failed" | "network" | "interrupted" | "unknown",
    public readonly originalError?: unknown,
  ) {
    super(message)
    this.name = "StreamingError"
  }
}

export const CRITICAL_TOKEN_USAGE_MESSAGE =
  "**CRITICAL TOKEN USAGE: The conversation is getting too long to fit the context window. If you are planning to use more tools, summarize your findings to the user first, and wait for user confirmation to continue working on the task.**"

export const MAX_TOOL_CALL_ROUNDS = 50

export const TOOL_CALL_LIMIT_MESSAGE =
  "Tool call limit exceeded for this turn. You may not use any tools. Provide a response summarizing your findings."

export const safeJsonParse = <T>(text: string): T | object => {
  try {
    return JSON.parse(text) as T
  } catch {
    try {
      return JSON.parse(jsonrepair(text)) as T
    } catch {
      return {}
    }
  }
}

// For custom providers naive token estimation
export function getMessageTextLength(m: {
  content?: string | null
  reasoning?: { content: string } | null
  tool_calls?: { name: string; arguments: string }[]
}): number {
  let len = m.content?.length ?? 0
  if (m.reasoning?.content) len += m.reasoning.content.length
  if (m.tool_calls) {
    for (const tc of m.tool_calls) {
      len += tc.name.length + tc.arguments.length
    }
  }
  return len
}

export type ToolExecutionContext = {
  suggestedSQL?: string
}

export const executeTool = async (
  toolName: string,
  input: unknown,
  modelToolsClient: ModelToolsClient,
  setStatus: StatusCallback,
  context?: ToolExecutionContext,
): Promise<{ content: string; is_error?: boolean }> => {
  try {
    switch (toolName) {
      case "suggest_query": {
        const query = (input as { query: string })?.query
        if (!query) {
          return {
            content: "Error: query parameter is required",
            is_error: true,
          }
        }
        if (context) {
          context.suggestedSQL = query
        }
        return {
          content:
            "Query suggestion registered. It will be shown to the user as a suggestion they can accept or reject.",
        }
      }
      case "get_tables": {
        setStatus(AIOperationStatus.RetrievingTables)
        if (!modelToolsClient.getTables) {
          return {
            content:
              "Error: Schema access is not granted. This tool is not available.",
            is_error: true,
          }
        }
        const result = await modelToolsClient.getTables()
        const MAX_TABLES = 1000
        if (result.length > MAX_TABLES) {
          const truncated = result.slice(0, MAX_TABLES)
          return {
            content: JSON.stringify(
              {
                tables: truncated,
                total_count: result.length,
                truncated: true,
                message: `Showing ${MAX_TABLES} of ${result.length} tables. Use get_table_schema with a specific table name to get details if you are interested in a specific table.`,
              },
              null,
              2,
            ),
          }
        }
        return { content: JSON.stringify(result, null, 2) }
      }
      case "get_table_schema": {
        const tableName = (input as { table_name: string })?.table_name
        if (!modelToolsClient.getTableSchema) {
          return {
            content:
              "Error: Schema access is not granted. This tool is not available.",
            is_error: true,
          }
        }
        if (!tableName) {
          return {
            content: "Error: table_name parameter is required",
            is_error: true,
          }
        }
        setStatus(AIOperationStatus.InvestigatingTable, {
          name: tableName,
          tableOpType: "schema",
        })
        const result = await modelToolsClient.getTableSchema(tableName)
        return {
          content:
            result || `Table '${tableName}' not found or schema unavailable`,
        }
      }
      case "get_table_details": {
        const tableName = (input as { table_name: string })?.table_name
        if (!modelToolsClient.getTableDetails) {
          return {
            content:
              "Error: Schema access is not granted. This tool is not available.",
            is_error: true,
          }
        }
        if (!tableName) {
          return {
            content: "Error: table_name parameter is required",
            is_error: true,
          }
        }
        setStatus(AIOperationStatus.InvestigatingTable, {
          name: tableName,
          tableOpType: "details",
        })
        const result = await modelToolsClient.getTableDetails(tableName)
        return {
          content: result
            ? JSON.stringify(result, null, 2)
            : "Table details not found",
          is_error: !result,
        }
      }
      case "validate_query": {
        setStatus(AIOperationStatus.ValidatingQuery)
        const query = (input as { query: string })?.query
        if (!query) {
          return {
            content: "Error: query parameter is required",
            is_error: true,
          }
        }
        const result = await modelToolsClient.validateQuery(query)
        const content = {
          valid: result.valid,
          error: result.valid ? undefined : result.error,
          position: result.valid ? undefined : result.position,
        }
        return { content: JSON.stringify(content, null, 2) }
      }
      case "get_questdb_toc": {
        setStatus(AIOperationStatus.RetrievingDocumentation)
        const tocContent = await getQuestDBTableOfContents()
        return { content: tocContent }
      }
      case "get_questdb_documentation": {
        const { category, items } =
          (input as { category: string; items: string[] }) || {}
        if (!category || !items || !Array.isArray(items)) {
          return {
            content: "Error: category and items parameters are required",
            is_error: true,
          }
        }
        const parsedItems = parseDocItems(items)

        if (parsedItems.length > 0) {
          setStatus(AIOperationStatus.InvestigatingDocs, { items: parsedItems })
        } else {
          setStatus(AIOperationStatus.InvestigatingDocs)
        }
        const documentation = await getSpecificDocumentation(
          category as DocCategory,
          items,
        )
        return { content: documentation }
      }
      default:
        return { content: `Unknown tool: ${toolName}`, is_error: true }
    }
  } catch (error) {
    return {
      content: `Tool execution error: ${error instanceof Error ? error.message : "Unknown error"}`,
      is_error: true,
    }
  }
}
