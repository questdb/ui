import type { ModelToolsClient, StatusCallback } from "../aiAssistant"
import { AIOperationStatus } from "../../providers/AIStatusProvider"
import {
  getQuestDBTableOfContents,
  getSpecificDocumentation,
  parseDocItems,
  DocCategory,
} from "../questdbDocsRetrieval"
import type { ResponseFormatSchema } from "./types"
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

export function extractPartialExplanation(partialJson: string): string {
  const explanationMatch = partialJson.match(
    /"explanation"\s*:\s*"((?:[^"\\]|\\.)*)/,
  )
  if (!explanationMatch) {
    return ""
  }

  return explanationMatch[1]
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
}

export const executeTool = async (
  toolName: string,
  input: unknown,
  modelToolsClient: ModelToolsClient,
  setStatus: StatusCallback,
): Promise<{ content: string; is_error?: boolean }> => {
  try {
    switch (toolName) {
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

export function extractJsonWithExpectedFields(
  text: string,
  expectedFields: string[],
): Record<string, unknown> | null {
  let searchStart = 0
  while (true) {
    const braceStart = text.indexOf("{", searchStart)
    if (braceStart === -1) break

    const textFromBrace = text.slice(braceStart)
    let endIdx = textFromBrace.lastIndexOf("}")
    while (endIdx > 0) {
      const candidate = textFromBrace.slice(0, endIdx + 1)
      // Try direct JSON.parse first, then jsonrepair as fallback
      let parsed: Record<string, unknown> | null = null
      try {
        parsed = JSON.parse(candidate) as Record<string, unknown>
      } catch {
        try {
          parsed = JSON.parse(jsonrepair(candidate)) as Record<string, unknown>
        } catch {
          // jsonrepair couldn't fix it either
        }
      }

      if (parsed !== null) {
        if (expectedFields.every((field) => field in parsed)) {
          const result: Record<string, unknown> = {}
          for (const field of expectedFields) {
            result[field] = parsed[field]
          }
          return result
        }
        break // Valid JSON but missing expected fields — try next {
      }
      endIdx = textFromBrace.lastIndexOf("}", endIdx - 1)
    }
    searchStart = braceStart + 1
  }
  return null
}

export function parseCustomProviderResponse<T>(
  text: string,
  expectedFields: string[],
  fallback: (rawText: string) => T,
): T {
  try {
    return JSON.parse(text) as T
  } catch {
    // not valid JSON as-is
  }

  const extracted = extractJsonWithExpectedFields(text, expectedFields)
  if (extracted) {
    return extracted as T
  }

  try {
    const repaired = JSON.parse(jsonrepair(text)) as Record<string, unknown>
    if (
      repaired !== null &&
      typeof repaired === "object" &&
      !Array.isArray(repaired) &&
      (expectedFields.length === 0 ||
        expectedFields.every((field) => field in repaired))
    ) {
      return repaired as T
    }
  } catch {
    // jsonrepair couldn't salvage it
  }

  // Fallback — caller decides the shape
  return fallback(text)
}

export function responseFormatToPromptInstruction(
  format: ResponseFormatSchema,
): string {
  const properties = format.schema.properties as Record<
    string,
    { type: unknown }
  >
  const required = (format.schema.required as string[]) || []

  const fields = Object.entries(properties)
    .map(([key, value]) => {
      const typeStr = Array.isArray(value.type)
        ? value.type.join(" | ")
        : String(value.type)
      const isRequired = required.includes(key)
      return `  "${key}": ${typeStr}${isRequired ? " (required)" : " (optional)"}`
    })
    .join(",\n")

  return `\nAlways respond with a valid JSON object with the following fields:\n{\n${fields}\n}`
}
