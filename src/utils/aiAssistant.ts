import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { Client } from "./questdb/client"
import { Type } from "./questdb/types"
import { getModelProps, MODEL_OPTIONS } from "./aiAssistantSettings"
import type { ModelOption, Provider } from "./aiAssistantSettings"
import { formatSql } from "./formatSql"
import { AIOperationStatus, StatusArgs } from "../providers/AIStatusProvider"
import {
  getQuestDBTableOfContents,
  getSpecificDocumentation,
  parseDocItems,
  DocCategory,
} from "./questdbDocsRetrieval"
import { MessageParam } from "@anthropic-ai/sdk/resources/messages"
import type {
  ResponseOutputItem,
  ResponseTextConfig,
} from "openai/resources/responses/responses"
import type { Tool as AnthropicTool } from "@anthropic-ai/sdk/resources/messages"
import type {
  ConversationId,
  ConversationMessage,
} from "../providers/AIConversationProvider/types"
import { compactConversationIfNeeded } from "./contextCompaction"
import { COMPACTION_THRESHOLDS } from "./tokenCounting"

export type ActiveProviderSettings = {
  model: string
  provider: Provider
  apiKey: string
}

export interface AiAssistantAPIError {
  type: "rate_limit" | "invalid_key" | "network" | "unknown" | "aborted"
  message: string
  details?: string
}

export interface AiAssistantExplanation {
  explanation: string
  tokenUsage?: TokenUsage
}

export type AiAssistantValidateQueryResult =
  | { valid: true }
  | { valid: false; error: string; position: number }

export interface TableSchemaExplanation {
  explanation: string
  columns: Array<{
    name: string
    description: string
    data_type: string
  }>
  storage_details: string[]
  tokenUsage?: TokenUsage
}

export const schemaExplanationToMarkdown = (
  explanation: TableSchemaExplanation,
): string => {
  let md = ""

  md += `${explanation.explanation}\n\n`

  if (explanation.columns.length > 0) {
    md += `## Columns\n\n`
    md += `| Column | Type | Description |\n`
    md += `|--------|------|-------------|\n`
    for (const col of explanation.columns) {
      md += `| ${col.name} | \`${col.data_type}\` | ${col.description} |\n`
    }
    md += `\n`
  }

  if (explanation.storage_details.length > 0) {
    md += `## Storage Details\n\n`
    for (const detail of explanation.storage_details) {
      md += `- ${detail}\n`
    }
  }

  return md
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface GeneratedSQL {
  sql: string | null
  explanation?: string
  tokenUsage?: TokenUsage
}

export interface ModelToolsClient {
  validateQuery: (query: string) => Promise<AiAssistantValidateQueryResult>
  getTables?: () => Promise<Array<{ name: string; type: "table" | "matview" }>>
  getTableSchema?: (tableName: string) => Promise<string | null>
}

export type StatusCallback = (
  status: AIOperationStatus | null,
  args?: StatusArgs,
) => void

type ProviderClients =
  | {
      provider: "anthropic"
      anthropic: Anthropic
    }
  | {
      provider: "openai"
      openai: OpenAI
    }

const ExplainFormat: ResponseTextConfig = {
  format: {
    type: "json_schema" as const,
    name: "explain_format",
    schema: {
      type: "object",
      properties: {
        explanation: { type: "string" },
      },
      required: ["explanation"],
      additionalProperties: false,
    },
    strict: true,
  },
}

const FixSQLFormat: ResponseTextConfig = {
  format: {
    type: "json_schema" as const,
    name: "fix_sql_format",
    schema: {
      type: "object",
      properties: {
        sql: { type: ["string", "null"] },
        explanation: { type: "string" },
      },
      required: ["explanation", "sql"],
      additionalProperties: false,
    },
    strict: true,
  },
}

const ExplainTableSchemaFormat: ResponseTextConfig = {
  format: {
    type: "json_schema" as const,
    name: "explain_table_schema_format",
    schema: {
      type: "object",
      properties: {
        explanation: { type: "string" },
        columns: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              data_type: { type: "string" },
            },
            required: ["name", "description", "data_type"],
            additionalProperties: false,
          },
        },
        storage_details: {
          type: ["array", "null"],
          items: { type: "string" },
        },
      },
      required: ["explanation", "columns", "storage_details"],
      additionalProperties: false,
    },
    strict: true,
  },
}

const ConversationResponseFormat: ResponseTextConfig = {
  format: {
    type: "json_schema" as const,
    name: "conversation_response_format",
    schema: {
      type: "object",
      properties: {
        sql: { type: ["string", "null"] },
        explanation: { type: "string" },
      },
      required: ["explanation", "sql"],
      additionalProperties: false,
    },
    strict: true,
  },
}

const inferProviderFromModel = (model: string): Provider => {
  const found: ModelOption | undefined = MODEL_OPTIONS.find(
    (m) => m.value === model,
  )
  if (found) return found.provider
  return model.startsWith("claude") ? "anthropic" : "openai"
}

const createProviderClients = (
  settings: ActiveProviderSettings,
): ProviderClients => {
  if (!settings.apiKey) {
    throw new Error(`No API key found for ${settings.provider}`)
  }

  if (settings.provider === "openai") {
    return {
      provider: settings.provider,
      openai: new OpenAI({
        apiKey: settings.apiKey,
        dangerouslyAllowBrowser: true,
      }),
    }
  }
  return {
    provider: settings.provider,
    anthropic: new Anthropic({
      apiKey: settings.apiKey,
      dangerouslyAllowBrowser: true,
    }),
  }
}

const SCHEMA_TOOLS: Array<AnthropicTool> = [
  {
    name: "get_tables",
    description:
      "Get a list of all tables and materialized views in the QuestDB database",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_table_schema",
    description:
      "Get the full schema definition (DDL) for a specific table or materialized view",
    input_schema: {
      type: "object" as const,
      properties: {
        table_name: {
          type: "string" as const,
          description:
            "The name of the table or materialized view to get schema for",
        },
      },
      required: ["table_name"],
    },
  },
]

const REFERENCE_TOOLS = [
  {
    name: "validate_query",
    description:
      "Validate the syntax correctness of a SQL query using QuestDB's SQL syntax validator. All generated SQL queries should be validated using this tool before responding to the user.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "The SQL query to validate",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_questdb_toc",
    description:
      "Get a table of contents listing all available QuestDB functions, operators, and SQL keywords. Use this first to see what documentation is available before requesting specific items.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_questdb_documentation",
    description:
      "Get documentation for specific QuestDB functions, operators, or SQL keywords. This is much more efficient than loading all documentation.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string" as const,
          enum: ["functions", "operators", "sql", "concepts", "schema"],
          description: "The category of documentation to retrieve",
        },
        items: {
          type: "array" as const,
          items: {
            type: "string" as const,
          },
          description:
            "List of specific docs items in the category. IMPORTANT: Category of these items must match the category parameter. Name of these items should exactly match the entry in the table of contents you get with get_questdb_toc.",
        },
      },
      required: ["category", "items"],
    },
  },
]

const ALL_TOOLS = [...SCHEMA_TOOLS, ...REFERENCE_TOOLS]

const toOpenAIFunctions = (
  tools: Array<{
    name: string
    description?: string
    input_schema: AnthropicTool["input_schema"]
  }>,
) => {
  return tools.map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description,
    parameters: { ...t.input_schema, additionalProperties: false },
    strict: true,
  })) as OpenAI.Responses.Tool[]
}

export const normalizeSql = (sql: string, insertSemicolon: boolean = true) => {
  if (!sql) return ""
  let result = sql.trim()
  if (result.endsWith(";")) {
    result = result.slice(0, -1)
  }
  return formatSql(result) + (insertSemicolon ? ";" : "")
}

export function isAiAssistantError(
  response:
    | AiAssistantAPIError
    | AiAssistantExplanation
    | GeneratedSQL
    | Partial<GeneratedSQL>,
): response is AiAssistantAPIError {
  if ("type" in response && "message" in response) {
    return true
  }
  return false
}

export function createModelToolsClient(
  questClient: Client,
  tables?: Array<{ table_name: string; matView?: boolean }>,
): ModelToolsClient {
  return {
    async validateQuery(
      query: string,
    ): Promise<AiAssistantValidateQueryResult> {
      try {
        const response = await questClient.validateQuery(query)
        if ("error" in response) {
          const errorResponse = response as {
            error: string
            position: number
            query: string
          }
          return {
            valid: false,
            error: String(errorResponse.error),
            position: Number(errorResponse.position),
          }
        }
        return {
          valid: true,
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to validate query. Something went wrong with the server."
        return {
          valid: false,
          error: errorMessage,
          position: -1,
        }
      }
    },
    ...(tables
      ? {
          getTables(): Promise<
            Array<{ name: string; type: "table" | "matview" }>
          > {
            return Promise.resolve(
              tables.map((table) => ({
                name: table.table_name,
                type: table.matView ? "matview" : ("table" as const),
              })),
            )
          },

          async getTableSchema(tableName: string): Promise<string | null> {
            try {
              const table = tables.find((t) => t.table_name === tableName)
              if (!table) {
                return null
              }

              const ddlResponse = table.matView
                ? await questClient.showMatViewDDL(tableName)
                : await questClient.showTableDDL(tableName)

              if (
                ddlResponse?.type === Type.DQL &&
                ddlResponse.data?.[0]?.ddl
              ) {
                return ddlResponse.data[0].ddl
              }

              return null
            } catch (error) {
              console.error(
                `Failed to fetch schema for table ${tableName}:`,
                error,
              )
              return null
            }
          },
        }
      : {}),
  }
}

const DOCS_INSTRUCTION_ANTHROPIC = `
CRITICAL: Always follow this two-phase documentation approach:
1. Use get_questdb_toc to see available functions/keywords/operators
2. Use get_questdb_documentation to get details for specific items you'll use`

const getUnifiedPrompt = (grantSchemaAccess?: boolean) => {
  const base = `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database. You help users with:
- Generating QuestDB SQL queries from natural language descriptions
- Explaining what QuestDB SQL queries do
- Fixing errors in QuestDB SQL queries
- Refining and modifying existing queries based on user requests

## When Explaining Queries
- Focus on the business logic and what the query achieves, not the SQL syntax itself
- Pay special attention to QuestDB-specific features:
  - Time-series operations (SAMPLE BY, LATEST ON, designated timestamp columns)
  - Time-based filtering and aggregations
  - Real-time data ingestion patterns
  - Performance optimizations specific to time-series data

## When Generating SQL
- Always validate the query using the validate_query tool before returning the generated SQL query
- Generate only valid QuestDB SQL syntax referring to the documentation about functions, operators, and SQL keywords
- Use appropriate time-series functions (SAMPLE BY, LATEST ON, etc.) and common table expressions when relevant
- Use \`IN\` with \`today()\`, \`tomorrow()\`, \`yesterday()\` interval functions when relevant
- Follow QuestDB best practices for performance referring to the documentation
- Use proper timestamp handling for time-series data
- Use correct data types and functions specific to QuestDB referring to the documentation. Do not use any word that is not in the documentation.

## When Fixing Queries
- Always validate the query using the validate_query tool before returning the fixed SQL query
- Analyze the error message carefully to understand what went wrong
- Generate only valid QuestDB SQL syntax by always referring to the documentation about functions, operators, and SQL keywords
- Preserve the original intent of the query while fixing the error
- Follow QuestDB best practices and syntax rules referring to the documentation
- Consider common issues like:
  - Missing or incorrect column names
  - Invalid syntax for time-series operations
  - Data type mismatches
  - Incorrect function usage

## Response Guidelines
- Modify a query by returning "sql" field only if the user asks you to generate, fix, or make changes to the query. If the user does not ask for fixing/changing/generating a query, return null in the "sql" field. Every time you provide a SQL query, the current SQL is updated.
- Always provide the "explanation" field, which should be a 2-4 sentence explanation in markdown format.

## Tools

`
  const schemaAccess = grantSchemaAccess
    ? `You have access to schema tools:
- Use the get_tables tool to retrieve all tables and materialized views in the database instance
- Use the get_table_schema tool to get detailed schema information for a specific table or a materialized view
`
    : ""
  return base + schemaAccess + DOCS_INSTRUCTION_ANTHROPIC
}

export const getExplainSchemaPrompt = (
  tableName: string,
  schema: string,
  kindLabel: string,
) => `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database.
Briefly explain the following ${kindLabel} schema in detail. Include:
- The purpose of the ${kindLabel}
- What each column represents and its data type
- Any important properties like WAL enablement, partitioning strategy, designated timestamps
- Any performance or storage considerations

${kindLabel} Name: ${tableName}

Schema:
\`\`\`sql
${schema}
\`\`\`

Provide a short explanation that helps developers understand how to use this ${kindLabel}.

Return a JSON string with the following structure:
{ "explanation": "The purpose of the table/materialized view/view", "columns": [ { "name": "Column Name", "description": "Column Description", "data_type": "Data Type" } ], "storage_details": ["Storage detail 1", "Storage detail 2"] | "null" for views }`

const MAX_RETRIES = 2
const RETRY_DELAY = 1000

let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 2000

const handleRateLimit = async () => {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest),
    )
  }
  lastRequestTime = Date.now()
}

const isNonRetryableError = (error: unknown) => {
  return (
    error instanceof RefusalError ||
    error instanceof MaxTokensError ||
    error instanceof Anthropic.AuthenticationError ||
    (typeof OpenAI !== "undefined" &&
      error instanceof OpenAI.AuthenticationError) ||
    // @ts-expect-error no proper rate limit error type
    ("status" in error && error.status === 429)
  )
}

const executeTool = async (
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
        setStatus(AIOperationStatus.InvestigatingTableSchema, {
          name: tableName,
        })
        const result = await modelToolsClient.getTableSchema(tableName)
        return {
          content:
            result || `Table '${tableName}' not found or schema unavailable`,
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

interface AnthropicToolCallResult {
  message: Anthropic.Messages.Message
  accumulatedTokens: TokenUsage
}

async function handleToolCalls(
  message: Anthropic.Messages.Message,
  anthropic: Anthropic,
  modelToolsClient: ModelToolsClient,
  conversationHistory: Array<MessageParam>,
  model: string,
  setStatus: StatusCallback,
  responseFormat: ResponseTextConfig,
  abortSignal?: AbortSignal,
  accumulatedTokens: TokenUsage = { inputTokens: 0, outputTokens: 0 },
): Promise<AnthropicToolCallResult | AiAssistantAPIError> {
  const toolUseBlocks = message.content.filter(
    (block) => block.type === "tool_use",
  )
  const toolResults = []

  if (abortSignal?.aborted) {
    return {
      type: "aborted",
      message: "Operation was cancelled",
    } as AiAssistantAPIError
  }

  for (const toolUse of toolUseBlocks) {
    if ("name" in toolUse) {
      const exec = await executeTool(
        toolUse.name,
        toolUse.input,
        modelToolsClient,
        setStatus,
      )
      toolResults.push({
        type: "tool_result" as const,
        tool_use_id: toolUse.id,
        content: exec.content,
        is_error: exec.is_error,
      })
    }
  }

  const updatedHistory = [
    ...conversationHistory,
    {
      role: "assistant" as const,
      content: message.content,
    },
    {
      role: "user" as const,
      content: toolResults,
    },
  ]

  const criticalTokenUsage =
    message.usage.input_tokens >= COMPACTION_THRESHOLDS["anthropic"] &&
    toolResults.length > 0
  if (criticalTokenUsage) {
    updatedHistory.push({
      role: "user" as const,
      content:
        "**CRITICAL TOKEN USAGE: The conversation is getting too long to fit the context window. If you are planning to use more tools, summarize your findings to the user first, and wait for user confirmation to continue working on the task.**",
    })
  }

  const followUpParams: Parameters<typeof createAnthropicMessage>[1] = {
    model,
    tools: modelToolsClient ? ALL_TOOLS : REFERENCE_TOOLS,
    messages: updatedHistory,
    temperature: 0.3,
  }

  const format = responseFormat.format as { type: string; schema?: object }
  if (format.type === "json_schema" && format.schema) {
    // @ts-expect-error - output_format is a new field not yet in the type definitions
    followUpParams.output_format = {
      type: "json_schema",
      schema: format.schema,
    }
  }

  const followUpMessage = await createAnthropicMessage(
    anthropic,
    followUpParams,
  )

  // Accumulate tokens from this response
  const newAccumulatedTokens: TokenUsage = {
    inputTokens:
      accumulatedTokens.inputTokens +
      (followUpMessage.usage?.input_tokens || 0),
    outputTokens:
      accumulatedTokens.outputTokens +
      (followUpMessage.usage?.output_tokens || 0),
  }

  if (followUpMessage.stop_reason === "tool_use") {
    return handleToolCalls(
      followUpMessage,
      anthropic,
      modelToolsClient,
      updatedHistory,
      model,
      setStatus,
      responseFormat,
      abortSignal,
      newAccumulatedTokens,
    )
  }

  return {
    message: followUpMessage,
    accumulatedTokens: newAccumulatedTokens,
  }
}

const extractOpenAIToolCalls = (
  response: OpenAI.Responses.Response,
): { id?: string; name: string; arguments: unknown; call_id: string }[] => {
  const calls = []
  for (const item of response.output) {
    if (item?.type === "function_call") {
      const args =
        typeof item.arguments === "string"
          ? safeJsonParse(item.arguments)
          : item.arguments || {}
      calls.push({
        id: item.id,
        name: item.name,
        arguments: args,
        call_id: item.call_id,
      })
    }
  }
  return calls
}

const getOpenAIText = (
  response: OpenAI.Responses.Response,
): { type: "refusal" | "text"; message: string } => {
  const out = response.output || []
  if (
    out.find(
      (item: ResponseOutputItem) =>
        item.type === "message" &&
        item.content.some((c) => c.type === "refusal"),
    )
  ) {
    return {
      type: "refusal",
      message: "The model refused to generate a response for this request.",
    }
  }
  return { type: "text", message: response.output_text }
}

const safeJsonParse = <T>(text: string): T | object => {
  try {
    return JSON.parse(text) as T
  } catch {
    return {}
  }
}

const tryWithRetries = async <T>(
  fn: () => Promise<T>,
  setStatus: StatusCallback,
  abortSignal?: AbortSignal,
): Promise<T | AiAssistantAPIError> => {
  let retries = 0
  while (retries <= MAX_RETRIES) {
    try {
      if (abortSignal?.aborted) {
        return {
          type: "aborted",
          message: "Operation was cancelled",
        } as AiAssistantAPIError
      }

      return await fn()
    } catch (error) {
      console.error(
        "AI Assistant error: ",
        error instanceof Error ? error.message : String(error),
        "Remaining retries: ",
        MAX_RETRIES - retries,
      )
      retries++
      if (retries > MAX_RETRIES || isNonRetryableError(error)) {
        setStatus(null)
        return handleAiAssistantError(error)
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * retries))
    }
  }

  setStatus(null)
  return {
    type: "unknown",
    message: `Failed to get response after ${retries} retries`,
  }
}

interface OpenAIFlowConfig<T> {
  systemInstructions: string
  initialUserContent: string
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
  responseFormat: ResponseTextConfig
  postProcess?: (formatted: T) => T
}

interface AnthropicFlowConfig<T> {
  systemInstructions: string
  initialUserContent: string
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
  responseFormat: ResponseTextConfig
  postProcess?: (formatted: T) => T
}

interface ExecuteAnthropicFlowParams<T> {
  anthropic: Anthropic
  model: string
  config: AnthropicFlowConfig<T>
  modelToolsClient: ModelToolsClient
  setStatus: StatusCallback
  abortSignal?: AbortSignal
}

interface ExecuteOpenAIFlowParams<T> {
  openai: OpenAI
  model: string
  config: OpenAIFlowConfig<T>
  modelToolsClient: ModelToolsClient
  setStatus: StatusCallback
  abortSignal?: AbortSignal
}

const executeOpenAIFlow = async <T>({
  openai,
  model,
  config,
  modelToolsClient,
  setStatus,
  abortSignal,
}: ExecuteOpenAIFlowParams<T>): Promise<T | AiAssistantAPIError> => {
  let input: OpenAI.Responses.ResponseInput = []
  if (config.conversationHistory && config.conversationHistory.length > 0) {
    const validMessages = config.conversationHistory.filter(
      (msg) => msg.content && msg.content.trim() !== "",
    )
    for (const msg of validMessages) {
      input.push({
        role: msg.role,
        content: msg.content,
      })
    }
  }

  input.push({
    role: "user",
    content: config.initialUserContent,
  })

  const grantSchemaAccess = !!modelToolsClient.getTables
  const openaiTools = toOpenAIFunctions(
    grantSchemaAccess ? ALL_TOOLS : REFERENCE_TOOLS,
  )

  // Accumulate tokens across all iterations
  let totalInputTokens = 0
  let totalOutputTokens = 0

  let lastResponse = await openai.responses.create({
    ...getModelProps(model),
    instructions: config.systemInstructions,
    input,
    tools: openaiTools,
    text: config.responseFormat,
  } as OpenAI.Responses.ResponseCreateParamsNonStreaming)
  input = [...input, ...lastResponse.output]

  // Add tokens from first response
  totalInputTokens += lastResponse.usage?.input_tokens ?? 0
  totalOutputTokens += lastResponse.usage?.output_tokens ?? 0

  while (true) {
    if (abortSignal?.aborted) {
      return {
        type: "aborted",
        message: "Operation was cancelled",
      } as AiAssistantAPIError
    }

    const toolCalls = extractOpenAIToolCalls(lastResponse)
    if (!toolCalls.length) break
    const tool_outputs: OpenAI.Responses.ResponseFunctionToolCallOutputItem[] =
      []
    for (const tc of toolCalls) {
      const exec = await executeTool(
        tc.name,
        tc.arguments,
        modelToolsClient,
        setStatus,
      )
      tool_outputs.push({
        type: "function_call_output",
        call_id: tc.call_id,
        output: exec.content,
      } as OpenAI.Responses.ResponseFunctionToolCallOutputItem)
    }
    input = [...input, ...tool_outputs]

    if (
      (lastResponse.usage?.input_tokens ?? 0) >=
        COMPACTION_THRESHOLDS["openai"] &&
      tool_outputs.length > 0
    ) {
      input.push({
        role: "user" as const,
        content:
          "**CRITICAL TOKEN USAGE: The conversation is getting too long to fit the context window. If you are planning to use more tools, summarize your findings to the user first, and wait for user confirmation to continue working on the task.**",
      })
    }
    lastResponse = await openai.responses.create({
      ...getModelProps(model),
      instructions: config.systemInstructions,
      input,
      tools: openaiTools,
      text: config.responseFormat,
    })
    input = [...input, ...lastResponse.output]

    // Accumulate tokens from each iteration
    totalInputTokens += lastResponse.usage?.input_tokens ?? 0
    totalOutputTokens += lastResponse.usage?.output_tokens ?? 0
  }

  if (abortSignal?.aborted) {
    return {
      type: "aborted",
      message: "Operation was cancelled",
    } as AiAssistantAPIError
  }

  const text = getOpenAIText(lastResponse)
  if (text.type === "refusal") {
    return {
      type: "unknown",
      message: text.message,
    } as AiAssistantAPIError
  }

  const rawOutput = text.message

  try {
    const json = JSON.parse(rawOutput) as T
    setStatus(null)

    const resultWithTokens = {
      ...json,
      tokenUsage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      },
    } as T & { tokenUsage: TokenUsage }

    if (config.postProcess) {
      const processed = config.postProcess(json)
      return {
        ...processed,
        tokenUsage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        },
      } as T & { tokenUsage: TokenUsage }
    }
    return resultWithTokens
  } catch (error) {
    setStatus(null)
    return {
      type: "unknown",
      message: "Failed to parse assistant response.",
    } as AiAssistantAPIError
  }
}

const executeAnthropicFlow = async <T>({
  anthropic,
  model,
  config,
  modelToolsClient,
  setStatus,
  abortSignal,
}: ExecuteAnthropicFlowParams<T>): Promise<T | AiAssistantAPIError> => {
  const initialMessages: MessageParam[] = []
  if (config.conversationHistory && config.conversationHistory.length > 0) {
    const validMessages = config.conversationHistory.filter(
      (msg) => msg.content && msg.content.trim() !== "",
    )
    for (const msg of validMessages) {
      initialMessages.push({
        role: msg.role,
        content: msg.content,
      })
    }
  }

  initialMessages.push({
    role: "user" as const,
    content: config.initialUserContent,
  })

  const grantSchemaAccess = !!modelToolsClient.getTables

  const messageParams: Parameters<typeof createAnthropicMessage>[1] = {
    model,
    system: config.systemInstructions,
    tools: grantSchemaAccess ? ALL_TOOLS : REFERENCE_TOOLS,
    messages: initialMessages,
    temperature: 0.3,
  }

  if (config.responseFormat?.format) {
    const format = config.responseFormat.format as {
      type: string
      schema?: object
    }
    if (format.type === "json_schema" && format.schema) {
      // @ts-expect-error - output_format is a new field not yet in the type definitions
      messageParams.output_format = {
        type: "json_schema",
        schema: format.schema,
      }
    }
  }

  const message = await createAnthropicMessage(anthropic, messageParams)

  let totalInputTokens = message.usage?.input_tokens || 0
  let totalOutputTokens = message.usage?.output_tokens || 0

  let responseMessage: Anthropic.Messages.Message

  if (message.stop_reason === "tool_use") {
    const toolCallResult = await handleToolCalls(
      message,
      anthropic,
      modelToolsClient,
      initialMessages,
      model,
      setStatus,
      config.responseFormat,
      abortSignal,
      { inputTokens: 0, outputTokens: 0 }, // Start fresh, we already counted initial message
    )

    if ("type" in toolCallResult && "message" in toolCallResult) {
      return toolCallResult
    }

    const result = toolCallResult
    responseMessage = result.message
    totalInputTokens += result.accumulatedTokens.inputTokens
    totalOutputTokens += result.accumulatedTokens.outputTokens
  } else {
    responseMessage = message
  }

  if (abortSignal?.aborted) {
    return {
      type: "aborted",
      message: "Operation was cancelled",
    } as AiAssistantAPIError
  }

  const textBlock = responseMessage.content.find(
    (block) => block.type === "text",
  )
  if (!textBlock || !("text" in textBlock)) {
    setStatus(null)
    return {
      type: "unknown",
      message: "No text response received from assistant.",
    } as AiAssistantAPIError
  }

  try {
    const json = JSON.parse(textBlock.text) as T
    setStatus(null)

    const resultWithTokens = {
      ...json,
      tokenUsage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      },
    } as T & { tokenUsage: TokenUsage }

    if (config.postProcess) {
      const processed = config.postProcess(json)
      return {
        ...processed,
        tokenUsage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        },
      } as T & { tokenUsage: TokenUsage }
    }
    return resultWithTokens
  } catch (error) {
    setStatus(null)
    return {
      type: "unknown",
      message: "Failed to parse assistant response.",
    } as AiAssistantAPIError
  }
}

export const explainTableSchema = async ({
  tableName,
  schema,
  kindLabel,
  settings,
  setStatus,
  abortSignal,
}: {
  tableName: string
  schema: string
  kindLabel: string
  settings: ActiveProviderSettings
  setStatus: StatusCallback
  abortSignal?: AbortSignal
}): Promise<TableSchemaExplanation | AiAssistantAPIError> => {
  if (!settings.apiKey || !settings.model) {
    return {
      type: "invalid_key",
      message: "API key is missing",
    }
  }
  if (!tableName || !schema) {
    return {
      type: "unknown",
      message: "Cannot find schema for the table",
    }
  }

  await handleRateLimit()
  setStatus(AIOperationStatus.Processing)

  return tryWithRetries(
    async () => {
      const clients = createProviderClients(settings)

      if (clients.provider === "openai") {
        const prompt = getExplainSchemaPrompt(tableName, schema, kindLabel)

        const formattingOutput = await clients.openai.responses.parse({
          ...getModelProps(settings.model),
          instructions: getExplainSchemaPrompt(tableName, schema, kindLabel),
          input: [{ role: "user", content: prompt }],
          text: ExplainTableSchemaFormat,
        })

        const formatted =
          formattingOutput.output_parsed as TableSchemaExplanation | null
        setStatus(null)
        if (!formatted) {
          return {
            type: "unknown",
            message: "Failed to parse assistant response.",
          } as AiAssistantAPIError
        }
        const openAIUsage = formattingOutput.usage
        return {
          explanation: formatted.explanation || "",
          columns: formatted.columns || [],
          storage_details: formatted.storage_details || [],
          tokenUsage: openAIUsage
            ? {
                inputTokens: openAIUsage.input_tokens,
                outputTokens: openAIUsage.output_tokens,
              }
            : undefined,
        }
      }

      const anthropic = clients.anthropic
      const messageParams: Parameters<typeof createAnthropicMessage>[1] = {
        model: getModelProps(settings.model).model,
        messages: [
          {
            role: "user" as const,
            content: getExplainSchemaPrompt(tableName, schema, kindLabel),
          },
        ],
        temperature: 0.3,
      }
      const schemaFormat = ExplainTableSchemaFormat.format as {
        type: string
        schema?: object
      }
      // @ts-expect-error - output_format is a new field not yet in the type definitions
      messageParams.output_format = {
        type: "json_schema",
        schema: schemaFormat.schema,
      }

      const message = await createAnthropicMessage(anthropic, messageParams)

      const textBlock = message.content.find((block) => block.type === "text")
      if (!textBlock || !("text" in textBlock)) {
        setStatus(null)
        return {
          type: "unknown",
          message: "No text response received from assistant.",
        } as AiAssistantAPIError
      }

      try {
        const json = JSON.parse(textBlock.text) as TableSchemaExplanation
        setStatus(null)
        const anthropicUsage = message.usage
        return {
          explanation: json.explanation || "",
          columns: json.columns || [],
          storage_details: json.storage_details || [],
          tokenUsage: anthropicUsage
            ? {
                inputTokens: anthropicUsage.input_tokens,
                outputTokens: anthropicUsage.output_tokens,
              }
            : undefined,
        }
      } catch (error) {
        setStatus(null)
        return {
          type: "unknown",
          message: "Failed to parse assistant response.",
        } as AiAssistantAPIError
      }
    },
    setStatus,
    abortSignal,
  )
}

class RefusalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RefusalError"
  }
}

class MaxTokensError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MaxTokensError"
  }
}

async function createAnthropicMessage(
  anthropic: Anthropic,
  params: Omit<Anthropic.MessageCreateParams, "max_tokens"> & {
    max_tokens?: number
  },
): Promise<Anthropic.Messages.Message> {
  const message = await anthropic.messages.create(
    {
      ...params,
      stream: false,
      max_tokens: params.max_tokens ?? 8192,
    },
    {
      headers: {
        "anthropic-beta": "structured-outputs-2025-11-13",
      },
    },
  )

  if (message.stop_reason === "refusal") {
    throw new RefusalError(
      "The model refused to generate a response for this request.",
    )
  }
  if (message.stop_reason === "max_tokens") {
    throw new MaxTokensError(
      "The response exceeded the maximum token limit. Please try again with a different prompt or model.",
    )
  }

  return message
}

function handleAiAssistantError(error: unknown): AiAssistantAPIError {
  if (error instanceof RefusalError) {
    return {
      type: "unknown",
      message: "The model refused to generate a response for this request.",
      details: error.message,
    }
  }

  if (error instanceof MaxTokensError) {
    return {
      type: "unknown",
      message:
        "The response exceeded the maximum token limit for the selected model. Please try again with a different prompt or model.",
      details: error.message,
    }
  }

  if (error instanceof Anthropic.AuthenticationError) {
    return {
      type: "invalid_key",
      message: "Invalid API key. Please check your Anthropic API key.",
      details: error.message,
    }
  }

  if (error instanceof Anthropic.RateLimitError) {
    return {
      type: "rate_limit",
      message: "Rate limit exceeded. Please try again later.",
      details: error.message,
    }
  }

  if (error instanceof Anthropic.APIConnectionError) {
    return {
      type: "network",
      message: "Network error. Please check your internet connection.",
      details: error.message,
    }
  }

  if (error instanceof Anthropic.APIError) {
    return {
      type: "unknown",
      message: `Anthropic API error: ${error.message}`,
    }
  }

  if (error instanceof OpenAI.APIError) {
    return {
      type: "unknown",
      message: `OpenAI API error: ${error.message}`,
    }
  }

  return {
    type: "unknown",
    message: "An unexpected error occurred. Please try again.",
    details: error as string,
  }
}

export const testApiKey = async (
  apiKey: string,
  model: string,
): Promise<{ valid: boolean; error?: string }> => {
  try {
    if (inferProviderFromModel(model) === "anthropic") {
      const anthropic = new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true,
      })

      await createAnthropicMessage(anthropic, {
        model,
        messages: [
          {
            role: "user",
            content: "ping",
          },
        ],
      })
    } else {
      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
      await openai.responses.create({
        model: getModelProps(model).model,
        input: [{ role: "user", content: "ping" }],
        max_output_tokens: 16,
      })
    }

    return { valid: true }
  } catch (error: unknown) {
    if (error instanceof Anthropic.AuthenticationError) {
      return {
        valid: false,
        error: "Invalid API key",
      }
    }

    if (error instanceof Anthropic.RateLimitError) {
      return {
        valid: true,
      }
    }

    const status =
      (error as { status?: number })?.status ||
      (error as { error?: { status?: number } })?.error?.status
    if (status === 401) {
      return { valid: false, error: "Invalid API key" }
    }
    if (status === 429) {
      return { valid: true }
    }

    return {
      valid: false,
      error:
        error instanceof Error ? error.message : "Failed to validate API key",
    }
  }
}

const ChatTitleFormat: ResponseTextConfig = {
  format: {
    type: "json_schema" as const,
    name: "chat_title_format",
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
      },
      required: ["title"],
      additionalProperties: false,
    },
    strict: true,
  },
}

export const generateChatTitle = async ({
  firstUserMessage,
  settings,
}: {
  firstUserMessage: string
  settings: ActiveProviderSettings
}): Promise<string | null> => {
  if (!settings.apiKey || !settings.model) {
    return null
  }

  try {
    const clients = createProviderClients(settings)

    const prompt = `Generate a concise chat title (max 30 characters) for this conversation. The title should capture the main topic or intent.

User's message:
${firstUserMessage}

Return a JSON object with the following structure: { "title": "Your title here" }`

    if (clients.provider === "openai") {
      const response = await clients.openai.responses.create({
        ...getModelProps(settings.model),
        input: [{ role: "user", content: prompt }],
        text: ChatTitleFormat,
        max_output_tokens: 100,
      })
      try {
        const parsed = JSON.parse(response.output_text) as { title: string }
        return parsed.title || null
      } catch {
        return null
      }
    }

    const messageParams: Parameters<typeof createAnthropicMessage>[1] = {
      model: settings.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 100,
      temperature: 0.3,
    }
    const titleFormat = ChatTitleFormat.format as {
      type: string
      schema?: object
    }
    // @ts-expect-error - output_format is a new field not yet in the type definitions
    messageParams.output_format = {
      type: "json_schema",
      schema: titleFormat.schema,
    }

    const message = await createAnthropicMessage(
      clients.anthropic,
      messageParams,
    )

    const textBlock = message.content.find((block) => block.type === "text")
    if (textBlock && "text" in textBlock) {
      try {
        const parsed = JSON.parse(textBlock.text) as { title: string }
        return parsed.title?.slice(0, 40) || null
      } catch {
        return null
      }
    }
    return null
  } catch (error) {
    // Silently fail - title generation is not critical
    console.warn("Failed to generate chat title:", error)
    return null
  }
}

export type AIOperation = "explain" | "fix" | "followup"

export const continueConversation = async ({
  userMessage,
  conversationHistory,
  currentSQL,
  settings,
  modelToolsClient,
  setStatus,
  abortSignal,
  operation = "followup",
}: {
  userMessage: string
  conversationHistory: Array<ConversationMessage>
  currentSQL?: string
  settings: ActiveProviderSettings
  modelToolsClient: ModelToolsClient
  setStatus: StatusCallback
  abortSignal?: AbortSignal
  operation?: AIOperation
  conversationId?: ConversationId
}): Promise<
  (GeneratedSQL | AiAssistantExplanation | AiAssistantAPIError) & {
    compactedConversationHistory?: Array<ConversationMessage>
  }
> => {
  if (!settings.apiKey || !settings.model) {
    return {
      type: "invalid_key",
      message: "API key or model is missing",
    }
  }

  await handleRateLimit()
  if (abortSignal?.aborted) {
    return {
      type: "aborted",
      message: "Operation was cancelled",
    }
  }

  const responseFormat = {
    explain: ExplainFormat,
    fix: FixSQLFormat,
    followup: ConversationResponseFormat,
  }[operation]

  return tryWithRetries(
    async () => {
      const clients = createProviderClients(settings)
      const grantSchemaAccess = !!modelToolsClient.getTables
      const systemPrompt = getUnifiedPrompt(grantSchemaAccess)

      let workingConversationHistory = conversationHistory
      let isCompacted = false

      setStatus(AIOperationStatus.Processing)
      if (conversationHistory.length > 0) {
        const compactionResult = await compactConversationIfNeeded(
          conversationHistory,
          settings.provider,
          systemPrompt,
          userMessage,
          () => setStatus(AIOperationStatus.Compacting),
          {
            anthropicClient:
              clients.provider === "anthropic" ? clients.anthropic : undefined,
            openaiClient:
              clients.provider === "openai" ? clients.openai : undefined,
            model: settings.model,
          },
        )

        if ("error" in compactionResult) {
          setStatus(null)
          console.error(
            "Failed to compact conversation:",
            compactionResult.error,
          )
          return {
            type: "unknown" as const,
            message: compactionResult.error,
          }
        }

        if (compactionResult.wasCompacted) {
          workingConversationHistory = [
            ...conversationHistory.map((m) => ({ ...m, isCompacted: true })),
            {
              id: crypto.randomUUID(),
              role: "assistant" as const,
              content: compactionResult.compactedMessage,
              hideFromUI: true,
              timestamp: Date.now(),
            },
          ]
          isCompacted = true
        }
      }
      setStatus(AIOperationStatus.Processing)

      const postProcess = (formatted: {
        sql?: string | null
        explanation: string
        tokenUsage?: TokenUsage
      }): GeneratedSQL => {
        const sql =
          formatted?.sql === null
            ? null
            : formatted?.sql
              ? normalizeSql(formatted.sql)
              : currentSQL || ""
        return {
          sql,
          explanation: formatted?.explanation || "",
          tokenUsage: formatted.tokenUsage,
        }
      }

      if (clients.provider === "openai") {
        const result = await executeOpenAIFlow<{
          sql?: string | null
          explanation: string
          tokenUsage?: TokenUsage
        }>({
          openai: clients.openai,
          model: settings.model,
          config: {
            systemInstructions: getUnifiedPrompt(grantSchemaAccess),
            initialUserContent: userMessage,
            conversationHistory: workingConversationHistory.filter(
              (m) => !m.isCompacted,
            ),
            responseFormat,
            postProcess: (formatted) => {
              const sql =
                formatted?.sql === null
                  ? null
                  : formatted?.sql
                    ? normalizeSql(formatted.sql)
                    : currentSQL || ""
              return {
                sql,
                explanation: formatted?.explanation || "",
                tokenUsage: formatted.tokenUsage,
              }
            },
          },
          modelToolsClient,
          setStatus,
          abortSignal,
        })
        if (isAiAssistantError(result)) {
          return result
        }
        return {
          ...postProcess(result),
          compactedConversationHistory: isCompacted
            ? workingConversationHistory
            : undefined,
        }
      }

      const result = await executeAnthropicFlow<{
        sql?: string | null
        explanation: string
        tokenUsage?: TokenUsage
      }>({
        anthropic: clients.anthropic,
        model: settings.model,
        config: {
          systemInstructions: getUnifiedPrompt(grantSchemaAccess),
          initialUserContent: userMessage,
          conversationHistory: workingConversationHistory.filter(
            (m) => !m.isCompacted,
          ),
          responseFormat,
          postProcess: (formatted) => {
            const sql =
              formatted?.sql === null
                ? null
                : formatted?.sql
                  ? normalizeSql(formatted.sql)
                  : currentSQL || ""
            return {
              sql,
              explanation: formatted?.explanation || "",
              tokenUsage: formatted.tokenUsage,
            }
          },
        },
        modelToolsClient,
        setStatus,
        abortSignal,
      })
      if (isAiAssistantError(result)) {
        return result
      }
      return {
        ...postProcess(result),
        compactedConversationHistory: isCompacted
          ? workingConversationHistory
          : undefined,
      }
    },
    setStatus,
    abortSignal,
  )
}
