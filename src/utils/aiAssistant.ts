import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { Client } from "./questdb/client"
import { Type } from "./questdb/types"
import { getModelProps, MODEL_OPTIONS } from "./aiAssistantSettings"
import type { ModelOption, Provider } from "./aiAssistantSettings"
import { formatSql } from "./formatSql"
import type { Request } from "../scenes/Editor/Monaco/utils"
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

type StatusCallback = (
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

const GeneratedSQLFormat: ResponseTextConfig = {
  format: {
    type: "json_schema" as const,
    name: "generated_sql_format",
    schema: {
      type: "object",
      properties: {
        sql: { type: "string" },
        explanation: { type: "string" },
      },
      required: ["sql", "explanation"],
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
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["explanation", "columns", "storage_details"],
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
          enum: ["functions", "operators", "sql"],
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
  tables?: Array<{ table_name: string; matView: boolean }>,
): ModelToolsClient {
  return {
    async validateQuery(
      query: string,
    ): Promise<AiAssistantValidateQueryResult> {
      try {
        const response = await questClient.validateQuery(query)
        if ("error" in response) {
          // TypeScript guard: if "error" exists, it's ValidateQueryErrorResult
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
            : "Failed to validate query. Something went wrong with the QuestDB API."
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

Important guidelines:
- Modify a query by returning "sql" field only if the user asks you to modify the query. Otherwise, return null in the "sql" field. Always provide the "explanation" field, which should be in markdown format.
- Always validate queries using the validate_query tool before returning SQL
- Generate only valid QuestDB SQL syntax referring to the documentation about functions, operators, and SQL keywords
- Use appropriate time-series functions (SAMPLE BY, LATEST ON, etc.) and common table expressions when relevant
- Use \`IN\` with \`today()\`, \`tomorrow()\`, \`yesterday()\` interval functions when relevant
- Use proper timestamp handling for time-series data
- Use correct data types and functions specific to QuestDB referring to the documentation. Do not use any word that is not in the documentation.
- When explaining queries, focus on the business logic and what the query achieves, not the SQL syntax itself
- Pay special attention to QuestDB-specific features such as time-series operations, time-based filtering, and performance optimizations
- When fixing queries, analyze the error carefully and preserve the original intent while fixing the issue
- When refining queries, understand the user's request and modify the query accordingly
- Always provide a 2-4 sentences explanation of your response in markdown format
`
  const schemaAccess = grantSchemaAccess
    ? `\n\nYou have access to schema tools:
- Use the get_tables tool to retrieve all tables and materialized views in the database instance
- Use the get_table_schema tool to get detailed schema information for a specific table or a materialized view
`
    : ""
  return base + schemaAccess + DOCS_INSTRUCTION_ANTHROPIC
}

const getExplainQueryPrompt = (grantSchemaAccess?: boolean) => {
  const base = `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database. When given a QuestDB SQL query, explain what it does in clear, concise plain English using markdown format.

Focus on the business logic and what the query achieves, not the SQL syntax itself. Pay special attention to QuestDB-specific features such as:
- Time-series operations (SAMPLE BY, LATEST ON, designated timestamp columns)
- Time-based filtering and aggregations
- Real-time data ingestion patterns
- Performance optimizations specific to time-series data
`
  const schemaAccess = grantSchemaAccess
    ? `\n\nYou have access to schema tools for better context:
- Use the get_tables tool to retrieve all tables and materialized views in the database instance
- Use the get_table_schema tool to get detailed schema information for a specific table or a materialized view
`
    : ""
  return base + schemaAccess + DOCS_INSTRUCTION_ANTHROPIC
}

const getGenerateSQLPrompt = (grantSchemaAccess?: boolean) => {
  const base = `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database.
When given a natural language description, generate the corresponding QuestDB SQL query.

Important guidelines:
- Always validate the query using the validate_query tool before returning the generated SQL query.
- Generate only valid QuestDB SQL syntax referring to the documentation about functions, operators, and SQL keywords
- Use appropriate time-series functions (SAMPLE BY, LATEST ON, etc.) and common table expressions when relevant
- Use \`IN\` with \`today()\`, \`tomorrow()\`, \`yesterday()\` interval functions when relevant
- Follow QuestDB best practices for performance referring to the documentation
- Use proper timestamp handling for time-series data
- Use correct data types and functions specific to QuestDB referring to the documentation. Do not use any word that is not in the documentation.
`
  const schemaAccess = grantSchemaAccess
    ? `\nYou have access to schema tools to understand the database structure:
- Use the get_tables tool to retrieve all tables and materialized views in the database instance
- Use the get_table_schema tool to get detailed schema information for a specific table or a materialized view
`
    : ""
  return base + schemaAccess + DOCS_INSTRUCTION_ANTHROPIC
}

const getFixQueryPrompt = (grantSchemaAccess?: boolean) => {
  const base = `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database.
When given a QuestDB SQL query with an error, fix the query to resolve the error.

Important guidelines:
1. Always validate the query using the validate_query tool before returning the fixed SQL query.
2. Analyze the error message carefully to understand what went wrong
3. Generate only valid QuestDB SQL syntax by always referring to the documentation about functions, operators, and SQL keywords
4. Preserve the original intent of the query while fixing the error
5. Follow QuestDB best practices and syntax rules referring to the documentation
6. Consider common issues like:
   - Missing or incorrect column names
   - Invalid syntax for time-series operations
   - Data type mismatches
   - Incorrect function usage
`
  const schemaAccess = grantSchemaAccess
    ? `\nYou have access to schema tools to verify table and column names:
- Use the get_tables tool to retrieve all tables and materialized views in the database instance
- Use the get_table_schema tool to get detailed schema information for a specific table or a materialized view
`
    : ""
  return base + schemaAccess + DOCS_INSTRUCTION_ANTHROPIC
}

const getExplainSchemaPrompt = (
  tableName: string,
  schema: string,
  isMatView: boolean,
) => `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database.
Briefly explain the following ${isMatView ? "materialized view" : "table"} schema in detail. Include:
- The purpose of the ${isMatView ? "materialized view" : "table"}
- What each column represents and its data type
- Any important properties like WAL enablement, partitioning strategy, designated timestamps
- Any performance or storage considerations

${isMatView ? "Materialized View" : "Table"} Name: ${tableName}

Schema:
\`\`\`sql
${schema}
\`\`\`

Provide a short explanation that helps developers understand how to use this ${isMatView ? "materialized view" : "table"}.

Return a JSON string with the following structure:
{ "explanation": "The purpose of the table/materialized view", "columns": [ { "name": "Column Name", "description": "Column Description", "data_type": "Data Type" } ], "storage_details": ["Storage detail 1", "Storage detail 2"] }`

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

async function handleToolCalls(
  message: Anthropic.Messages.Message,
  anthropic: Anthropic,
  modelToolsClient: ModelToolsClient,
  conversationHistory: Array<MessageParam>,
  model: string,
  setStatus: StatusCallback,
  abortSignal?: AbortSignal,
  responseFormat?: ResponseTextConfig,
): Promise<Anthropic.Messages.Message | AiAssistantAPIError> {
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

  const followUpParams: Parameters<typeof createAnthropicMessage>[1] = {
    model,
    tools: modelToolsClient ? ALL_TOOLS : REFERENCE_TOOLS,
    messages: updatedHistory,
    temperature: 0.3,
  }

  if (responseFormat?.format) {
    const format = responseFormat.format as { type: string; schema?: object }
    if (format.type === "json_schema" && format.schema) {
      // @ts-expect-error - output_format is a new field not yet in the type definitions
      followUpParams.output_format = {
        type: "json_schema",
        schema: format.schema,
      }
    }
  }

  const followUpMessage = await createAnthropicMessage(
    anthropic,
    followUpParams,
  )

  if (followUpMessage.stop_reason === "tool_use") {
    return handleToolCalls(
      followUpMessage,
      anthropic,
      modelToolsClient,
      updatedHistory,
      model,
      setStatus,
      abortSignal,
      responseFormat,
    )
  }

  return followUpMessage
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
  formattingPrompt?: string // Deprecated: Use responseFormat instead
  responseFormat?: ResponseTextConfig
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
  // Build input array with conversation history
  let input: OpenAI.Responses.ResponseInput = []

  // Add conversation history if provided
  if (config.conversationHistory && config.conversationHistory.length > 0) {
    for (const msg of config.conversationHistory) {
      input.push({
        role: msg.role,
        content: msg.content,
      })
    }
  }

  // Add current user message
  input.push({
    role: "user",
    content: config.initialUserContent,
  })

  const grantSchemaAccess = !!modelToolsClient.getTables
  const openaiTools = toOpenAIFunctions(
    grantSchemaAccess ? ALL_TOOLS : REFERENCE_TOOLS,
  )

  let lastResponse = await openai.responses.create({
    ...getModelProps(model),
    instructions: config.systemInstructions,
    input,
    tools: openaiTools,
    text: config.responseFormat,
  } as OpenAI.Responses.ResponseCreateParamsNonStreaming)
  input = [...input, ...lastResponse.output]

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
    lastResponse = await openai.responses.create({
      ...getModelProps(model),
      instructions: config.systemInstructions,
      input,
      tools: openaiTools,
      text: config.responseFormat,
    })
    input = [...input, ...lastResponse.output]
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

  // Extract token usage from OpenAI response
  const inputTokens = lastResponse.usage?.input_tokens ?? 0
  const outputTokens = lastResponse.usage?.output_tokens ?? 0

  try {
    const json = JSON.parse(rawOutput) as T
    setStatus(null)

    // Attach token usage to the result
    const resultWithTokens = {
      ...json,
      tokenUsage: {
        inputTokens,
        outputTokens,
      },
    } as T & { tokenUsage: TokenUsage }

    if (config.postProcess) {
      const processed = config.postProcess(json)
      return {
        ...processed,
        tokenUsage: {
          inputTokens,
          outputTokens,
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
  // Build messages array with conversation history
  const initialMessages: MessageParam[] = []

  // Add conversation history if provided
  if (config.conversationHistory && config.conversationHistory.length > 0) {
    for (const msg of config.conversationHistory) {
      initialMessages.push({
        role: msg.role,
        content: msg.content,
      })
    }
  }

  // Add current user message
  initialMessages.push({
    role: "user" as const,
    content: config.initialUserContent,
  })

  const grantSchemaAccess = !!modelToolsClient.getTables

  // Build the message create params
  const messageParams: Parameters<typeof createAnthropicMessage>[1] = {
    model,
    system: config.systemInstructions,
    tools: grantSchemaAccess ? ALL_TOOLS : REFERENCE_TOOLS,
    messages: initialMessages,
    temperature: 0.3,
  }

  // Add output_format if responseFormat is provided (new structured output approach)
  // Anthropic's output_format expects: { type: "json_schema", schema: <the schema object> }
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

  const response =
    message.stop_reason === "tool_use"
      ? await handleToolCalls(
          message,
          anthropic,
          modelToolsClient,
          initialMessages,
          model,
          setStatus,
          abortSignal,
          config.responseFormat,
        )
      : message

  const responseError = response as AiAssistantAPIError
  if (responseError.type === "aborted") {
    return responseError
  }

  if (abortSignal?.aborted) {
    return {
      type: "aborted",
      message: "Operation was cancelled",
    } as AiAssistantAPIError
  }

  const responseMessage = response as Anthropic.Messages.Message

  // Track token usage from the main response
  const inputTokens = responseMessage.usage?.input_tokens || 0
  let outputTokens = responseMessage.usage?.output_tokens || 0

  // If using new structured output format, parse directly from response
  if (config.responseFormat) {
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
          inputTokens,
          outputTokens,
        },
      } as T & { tokenUsage: TokenUsage }

      if (config.postProcess) {
        const processed = config.postProcess(json)
        return {
          ...processed,
          tokenUsage: {
            inputTokens,
            outputTokens,
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

  // Legacy: Use formatting prompt approach (deprecated)
  setStatus(AIOperationStatus.FormattingResponse)

  const formattingResponse = await createAnthropicMessage(anthropic, {
    model,
    messages: [
      { role: "assistant", content: responseMessage.content },
      { role: "user", content: config.formattingPrompt! },
      { role: "assistant", content: "{" },
    ],
    temperature: 0.3,
  })

  // Add formatting response tokens
  outputTokens += formattingResponse.usage?.output_tokens || 0

  const fullContent = formattingResponse.content.reduce((acc, block) => {
    if (block.type === "text" && "text" in block) {
      acc += block.text
    }
    return acc
  }, "{")

  try {
    if (abortSignal?.aborted) {
      return {
        type: "aborted",
        message: "Operation was cancelled",
      } as AiAssistantAPIError
    }
    const json = JSON.parse(fullContent) as T
    setStatus(null)

    // Attach token usage to the result
    const resultWithTokens = {
      ...json,
      tokenUsage: {
        inputTokens,
        outputTokens,
      },
    } as T & { tokenUsage: TokenUsage }

    if (config.postProcess) {
      const processed = config.postProcess(json)
      return {
        ...processed,
        tokenUsage: {
          inputTokens,
          outputTokens,
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

export const explainQuery = async ({
  query,
  settings,
  modelToolsClient,
  setStatus,
  abortSignal,
}: {
  query: Request
  settings: ActiveProviderSettings
  modelToolsClient: ModelToolsClient
  setStatus: StatusCallback
  abortSignal?: AbortSignal
}): Promise<AiAssistantExplanation | AiAssistantAPIError> => {
  if (!settings.apiKey || !settings.model || !query) {
    return {
      type: "invalid_key",
      message: "API key or query is missing",
    }
  }

  await handleRateLimit()
  if (abortSignal?.aborted) {
    return {
      type: "aborted",
      message: "Operation was cancelled",
    } as AiAssistantAPIError
  }
  setStatus(AIOperationStatus.Processing, { type: "explain" })

  return tryWithRetries(
    async () => {
      const clients = createProviderClients(settings)
      const grantSchemaAccess = !!modelToolsClient.getTables
      const content = query.selection
        ? `Explain this portion of the query:\n\n\`\`\`sql\n${query.selection.queryText}\n\`\`\` within this query:\n\n\`\`\`sql\n${query.query}\n\`\`\` with 2-4 sentences`
        : `Explain this SQL query with 2-4 sentences:\n\n\`\`\`sql\n${query.query}\n\`\`\``

      if (clients.provider === "openai") {
        return await executeOpenAIFlow<{ explanation: string }>({
          openai: clients.openai,
          model: settings.model,
          config: {
            systemInstructions: getExplainQueryPrompt(grantSchemaAccess),
            initialUserContent: content,
            responseFormat: ExplainFormat,
          },
          modelToolsClient,
          setStatus,
          abortSignal,
        })
      }

      return await executeAnthropicFlow<{ explanation: string }>({
        anthropic: clients.anthropic,
        model: settings.model,
        config: {
          systemInstructions: getExplainQueryPrompt(grantSchemaAccess),
          initialUserContent: content,
          responseFormat: ExplainFormat,
        },
        modelToolsClient,
        setStatus,
        abortSignal,
      })
    },
    setStatus,
    abortSignal,
  )
}

export const generateSQL = async ({
  description,
  conversationHistory,
  settings,
  modelToolsClient,
  setStatus,
  abortSignal,
}: {
  description: string
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
  settings: ActiveProviderSettings
  modelToolsClient: ModelToolsClient
  setStatus: StatusCallback
  abortSignal?: AbortSignal
}): Promise<GeneratedSQL | AiAssistantAPIError> => {
  if (!settings.apiKey || !settings.model || !description) {
    return {
      type: "invalid_key",
      message: "API key or description is missing",
    }
  }

  await handleRateLimit()
  if (abortSignal?.aborted) {
    return {
      type: "aborted",
      message: "Operation was cancelled",
    } as AiAssistantAPIError
  }
  setStatus(AIOperationStatus.Processing, { type: "generate" })

  return tryWithRetries(
    async () => {
      const clients = createProviderClients(settings)
      const grantSchemaAccess = !!modelToolsClient.getTables
      const initialUserContent = `For the following description, generate the corresponding QuestDB SQL query and 2-4 sentences explanation:\n\n\`\`\`\n${description}\n\`\`\``
      const postProcess = (formatted: {
        sql: string
        explanation: string
        tokenUsage?: TokenUsage
      }) => {
        if (!formatted || !formatted.sql) {
          return {
            sql: "",
            explanation: formatted?.explanation || "",
            tokenUsage: formatted?.tokenUsage,
          }
        }
        return {
          sql: normalizeSql(formatted.sql),
          explanation: formatted.explanation || "",
          tokenUsage: formatted.tokenUsage,
        }
      }

      if (clients.provider === "openai") {
        return await executeOpenAIFlow<{ sql: string; explanation: string }>({
          openai: clients.openai,
          model: settings.model,
          config: {
            systemInstructions: getGenerateSQLPrompt(grantSchemaAccess),
            initialUserContent,
            conversationHistory,
            responseFormat: GeneratedSQLFormat,
            postProcess,
          },
          modelToolsClient,
          setStatus,
          abortSignal,
        })
      }

      return await executeAnthropicFlow<{ sql: string; explanation: string }>({
        anthropic: clients.anthropic,
        model: settings.model,
        config: {
          systemInstructions: getGenerateSQLPrompt(grantSchemaAccess),
          initialUserContent,
          conversationHistory,
          responseFormat: GeneratedSQLFormat,
          postProcess,
        },
        modelToolsClient,
        setStatus,
        abortSignal,
      })
    },
    setStatus,
    abortSignal,
  )
}

export const fixQuery = async ({
  query,
  errorMessage,
  conversationHistory,
  settings,
  modelToolsClient,
  setStatus,
  abortSignal,
  word,
}: {
  query: string
  errorMessage: string
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
  settings: ActiveProviderSettings
  modelToolsClient: ModelToolsClient
  setStatus: StatusCallback
  abortSignal?: AbortSignal
  word: string | null
}): Promise<Partial<GeneratedSQL> | AiAssistantAPIError> => {
  if (!settings.apiKey || !settings.model || !query || !errorMessage) {
    return {
      type: "invalid_key",
      message: "API key, query, or error message is missing",
    }
  }

  await handleRateLimit()
  if (abortSignal?.aborted) {
    return {
      type: "aborted",
      message: "Operation was cancelled",
    } as AiAssistantAPIError
  }
  setStatus(AIOperationStatus.Processing, { type: "fix" })

  return tryWithRetries(
    async () => {
      const clients = createProviderClients(settings)
      const grantSchemaAccess = !!modelToolsClient.getTables
      const initialUserContent = `SQL Query:
\`\`\`sql
${query}
\`\`\`

Error Message:
\`\`\`
${errorMessage}
\`\`\`

Analyze the error and return the fixed SQL query if possible, always provide a 2-4 sentences explanation why it was failed and how it was fixed.
${word ? `The error occurred at word: ${word}` : ""}`
      const postProcess = (formatted: {
        explanation: string
        sql?: string
        tokenUsage?: TokenUsage
      }) => {
        return {
          ...(formatted?.sql
            ? { sql: normalizeSql(formatted.sql, false) }
            : {}),
          explanation: formatted?.explanation || "",
          tokenUsage: formatted?.tokenUsage,
        }
      }

      if (clients.provider === "openai") {
        return await executeOpenAIFlow<{ explanation: string; sql?: string }>({
          openai: clients.openai,
          model: settings.model,
          config: {
            systemInstructions: getFixQueryPrompt(grantSchemaAccess),
            initialUserContent,
            conversationHistory,
            responseFormat: FixSQLFormat,
            postProcess,
          },
          modelToolsClient,
          setStatus,
          abortSignal,
        })
      }

      return await executeAnthropicFlow<{ explanation: string; sql?: string }>({
        anthropic: clients.anthropic,
        model: settings.model,
        config: {
          systemInstructions: getFixQueryPrompt(grantSchemaAccess),
          initialUserContent,
          conversationHistory,
          responseFormat: FixSQLFormat,
          postProcess,
        },
        modelToolsClient,
        setStatus,
        abortSignal,
      })
    },
    setStatus,
    abortSignal,
  )
}

export const explainTableSchema = async ({
  tableName,
  schema,
  isMatView,
  settings,
  setStatus,
}: {
  tableName: string
  schema: string
  isMatView: boolean
  settings: ActiveProviderSettings
  setStatus: StatusCallback
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
  setStatus(AIOperationStatus.Processing, { type: "explain" })

  return tryWithRetries(async () => {
    const clients = createProviderClients(settings)

    if (clients.provider === "openai") {
      const prompt = getExplainSchemaPrompt(tableName, schema, isMatView)

      const formattingOutput = await clients.openai.responses.parse({
        model: settings.model,
        instructions: getExplainSchemaPrompt(tableName, schema, isMatView),
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
      return {
        explanation: formatted.explanation || "",
        columns: formatted.columns || [],
        storage_details: formatted.storage_details || [],
      }
    }

    const anthropic = clients.anthropic
    const messageParams: Parameters<typeof createAnthropicMessage>[1] = {
      model: settings.model,
      messages: [
        {
          role: "user" as const,
          content: getExplainSchemaPrompt(tableName, schema, isMatView),
        },
      ],
      temperature: 0.3,
    }
    // Anthropic's output_format expects: { type: "json_schema", schema: <the schema object> }
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
      return {
        explanation: json.explanation || "",
        columns: json.columns || [],
        storage_details: json.storage_details || [],
      }
    } catch (error) {
      setStatus(null)
      return {
        type: "unknown",
        message: "Failed to parse assistant response.",
      } as AiAssistantAPIError
    }
  }, setStatus)
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
      "The response exceeded the maximum token limit. Please try generating shorter queries or increase token limits.",
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
        "The response exceeded the maximum token limit. Please try generating shorter queries or increase token limits.",
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

export const formatExplanationAsComment = (
  explanation: string,
  prefix: string = "AI Explanation",
): string => {
  if (!explanation) return ""

  const MAX_LINE_LENGTH = 80 // Maximum characters per line
  const COMMENT_PREFIX = " * " // 3 characters
  const MAX_CONTENT_LENGTH = MAX_LINE_LENGTH - COMMENT_PREFIX.length

  const wrapLine = (text: string): string[] => {
    if (text.length <= MAX_CONTENT_LENGTH) {
      return [text]
    }

    const words = text.split(" ")
    const lines: string[] = []
    let currentLine = ""

    for (const word of words) {
      // If adding this word would exceed the limit
      if (currentLine.length + word.length + 1 > MAX_CONTENT_LENGTH) {
        if (currentLine.length > 0) {
          lines.push(currentLine.trim())
          currentLine = word
        } else {
          // Single word is too long, break it
          if (word.length > MAX_CONTENT_LENGTH) {
            const chunks = word.match(
              new RegExp(`.{1,${MAX_CONTENT_LENGTH}}`, "g"),
            ) || [word]
            lines.push(...chunks.slice(0, -1))
            currentLine = chunks[chunks.length - 1]
          } else {
            currentLine = word
          }
        }
      } else {
        currentLine += (currentLine.length > 0 ? " " : "") + word
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine.trim())
    }

    return lines
  }

  // Split explanation into paragraphs and wrap each line
  const paragraphs = explanation.split("\n")
  const wrappedLines: string[] = []

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === "") {
      wrappedLines.push("") // Preserve empty lines
    } else {
      const wrapped = wrapLine(paragraph.trim())
      wrappedLines.push(...wrapped)
    }
  }

  return `/*\n  ${prefix}:\n${wrappedLines.map((line) => `  ${line}`).join("\n")}\n */`
}

export const testApiKey = async (
  apiKey: string,
  model: string,
): Promise<{ valid: boolean; error?: string }> => {
  try {
    // Infer provider from model choice
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
        return parsed.title?.slice(0, 40) || null
      } catch {
        return null
      }
    }

    // Anthropic - use structured output
    const messageParams: Parameters<typeof createAnthropicMessage>[1] = {
      model: settings.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 100,
      temperature: 0.3,
    }
    // Anthropic's output_format expects: { type: "json_schema", schema: <the schema object> }
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

export const continueConversation = async ({
  userMessage,
  conversationHistory,
  currentSQL,
  originalQuery,
  settings,
  modelToolsClient,
  setStatus,
  abortSignal,
}: {
  userMessage: string
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
  currentSQL?: string
  originalQuery?: string
  settings: ActiveProviderSettings
  modelToolsClient: ModelToolsClient
  setStatus: StatusCallback
  abortSignal?: AbortSignal
}): Promise<GeneratedSQL | AiAssistantAPIError> => {
  // originalQuery is kept for potential future use
  void originalQuery
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

  setStatus(AIOperationStatus.Processing)

  return tryWithRetries(
    async () => {
      const clients = createProviderClients(settings)
      const grantSchemaAccess = !!modelToolsClient.getTables

      // Determine if this is a follow-up by checking if there are any assistant messages
      const hasAssistantMessages = conversationHistory.some(
        (msg) => msg.role === "assistant",
      )

      // Build the user message with appropriate context
      let userMessageWithContext = userMessage
      if (hasAssistantMessages) {
        // This is a true follow-up message (has previous assistant responses)
        // Check if userMessage already contains SQL context (from stored enriched message)
        // If it does, use it as-is; otherwise add follow-up prefix
        if (
          userMessage.includes("Current SQL query:") ||
          userMessage.includes("```sql")
        ) {
          // Already enriched, use as-is
          userMessageWithContext = userMessage
        } else {
          // Plain follow-up, add prefix
          userMessageWithContext = `Follow-up message on top of your latest changes: ${userMessage}`
        }
      }
      // If userMessage already contains SQL context (from stored enriched message), use it as-is
      // Otherwise, if it's the first message and we have currentSQL, add context
      else if (
        currentSQL &&
        !userMessage.includes("Current SQL query:") &&
        !userMessage.includes("```sql")
      ) {
        // First message with SQL context (like "Ask AI" flow)
        userMessageWithContext = `Current SQL query:\n\`\`\`sql\n${currentSQL}\n\`\`\`\n\nUser request: ${userMessage}`
      }

      // Build the conversation history to pass to execute functions
      // This should exclude the last message since it will be added as initialUserContent
      const historyWithoutLastMessage =
        conversationHistory && conversationHistory.length > 0
          ? conversationHistory.slice(0, -1)
          : []

      const postProcess = (formatted: {
        sql?: string | null
        explanation: string
        tokenUsage?: TokenUsage
      }): GeneratedSQL => {
        // If SQL is explicitly null, preserve that (no SQL change)
        // If SQL is undefined or empty, fall back to currentSQL
        // Otherwise normalize and use the provided SQL
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
            initialUserContent: userMessageWithContext,
            conversationHistory: historyWithoutLastMessage,
            responseFormat: ConversationResponseFormat,
            postProcess: (formatted) => {
              // Preserve null when model explicitly returns null (no SQL change)
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
        return postProcess(result)
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
          initialUserContent: userMessageWithContext,
          conversationHistory: historyWithoutLastMessage,
          responseFormat: ConversationResponseFormat,
          postProcess: (formatted) => {
            // Preserve null when model explicitly returns null (no SQL change)
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
      return postProcess(result)
    },
    setStatus,
    abortSignal,
  )
}
