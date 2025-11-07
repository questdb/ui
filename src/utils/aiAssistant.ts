import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { Client } from "./questdb/client"
import { Type } from "./questdb/types"
import type { AiAssistantSettings } from "../providers/LocalStorageProvider/types"
import { MODEL_OPTIONS } from "../components/SetupAIAssistant"
import type { ModelOption } from "../components/SetupAIAssistant"
import { formatSql } from "./formatSql"
import type { Request } from "../scenes/Editor/Monaco/utils"
import { AIOperationStatus } from "../providers/AIStatusProvider"
import {
  getQuestDBTableOfContents,
  getSpecificDocumentation,
  DocCategory,
} from "./questdbDocsRetrieval"
import { MessageParam } from "@anthropic-ai/sdk/resources/messages"
import type {
  ResponseOutputItem,
  ResponseTextConfig,
} from "openai/resources/responses/responses"
import type { Tool as AnthropicTool } from "@anthropic-ai/sdk/resources/messages"

export interface AiAssistantAPIError {
  type: "rate_limit" | "invalid_key" | "network" | "unknown" | "aborted"
  message: string
  details?: string
}

export interface AiAssistantExplanation {
  explanation: string
}

export interface TableSchemaExplanation {
  explanation: string
  columns: Array<{
    name: string
    description: string
    data_type: string
  }>
  storage_details: string[]
}

export interface GeneratedSQL {
  sql: string
  explanation?: string
}

export interface SchemaToolsClient {
  getTables: () => Promise<Array<{ name: string; type: "table" | "matview" }>>
  getTableSchema: (tableName: string) => Promise<string | null>
}

type StatusCallback = (status: AIOperationStatus | null) => void

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

const inferProviderFromModel = (model: string): "anthropic" | "openai" => {
  const found: ModelOption | undefined = MODEL_OPTIONS.find(
    (m) => m.value === model,
  )
  if (found) return found.provider
  return model.startsWith("claude") ? "anthropic" : "openai"
}

const createProviderClients = (
  settings: AiAssistantSettings,
): ProviderClients => {
  const provider = inferProviderFromModel(settings.model)
  if (provider === "openai") {
    return {
      provider,
      openai: new OpenAI({
        apiKey: settings.apiKey,
        dangerouslyAllowBrowser: true,
      }),
    }
  }
  return {
    provider,
    anthropic: new Anthropic({
      apiKey: settings.apiKey,
      dangerouslyAllowBrowser: true,
    }),
  }
}

const getStatusFromCategory = (category: DocCategory) => {
  switch (category) {
    case "functions":
      return AIOperationStatus.InvestigatingFunctions
    case "operators":
      return AIOperationStatus.InvestigatingOperators
    case "sql":
      return AIOperationStatus.InvestigatingKeywords
    default:
      return null
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

const DOC_TOOLS = [
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
            "List of specific function names, operators, or SQL keywords to get documentation for",
        },
      },
      required: ["category", "items"],
    },
  },
]

const ALL_TOOLS = [...SCHEMA_TOOLS, ...DOC_TOOLS]

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

const normalizeSql = (sql: string, insertSemicolon: boolean = true) => {
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
) {
  if ("type" in response && "message" in response) {
    return true
  }
  return false
}

export function createSchemaClient(
  tables: Array<{ table_name: string; matView: boolean }>,
  questClient: Client,
): SchemaToolsClient {
  return {
    getTables(): Promise<Array<{ name: string; type: "table" | "matview" }>> {
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

        if (ddlResponse?.type === Type.DQL && ddlResponse.data?.[0]?.ddl) {
          return ddlResponse.data[0].ddl
        }

        return null
      } catch (error) {
        console.error(`Failed to fetch schema for table ${tableName}:`, error)
        return null
      }
    },
  }
}

const DOCS_INSTRUCTION_ANTHROPIC = `
CRITICAL: Always follow this two-phase documentation approach:
1. Use get_questdb_toc to see available functions/keywords/operators
2. Use get_questdb_documentation to get details for specific items you'll use`

const getExplainQueryPrompt = (grantSchemaAccess?: boolean) => {
  const base = `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database. When given a QuestDB SQL query, explain what it does in clear, concise plain English.

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
1. Analyze the error message carefully to understand what went wrong
2. Generate only valid QuestDB SQL syntax by always referring to the documentation about functions, operators, and SQL keywords
3. Preserve the original intent of the query while fixing the error
4. Follow QuestDB best practices and syntax rules referring to the documentation
5. Consider common issues like:
   - Missing or incorrect column names
   - Invalid syntax for time-series operations
   - Data type mismatches
   - Missing quotes around string literals
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
      error instanceof OpenAI.AuthenticationError)
  )
}

const executeTool = async (
  toolName: string,
  input: unknown,
  schemaClient: SchemaToolsClient | undefined,
  setStatus: StatusCallback,
): Promise<{ content: string; is_error?: boolean }> => {
  try {
    switch (toolName) {
      case "get_tables": {
        setStatus(AIOperationStatus.RetrievingTables)
        if (!schemaClient) {
          return {
            content:
              "Error: Schema access is not granted. This tool is not available.",
            is_error: true,
          }
        }
        const result = await schemaClient.getTables()
        return { content: JSON.stringify(result, null, 2) }
      }
      case "get_table_schema": {
        setStatus(AIOperationStatus.InvestigatingTableSchema)
        const tableName = (input as { table_name: string })?.table_name
        if (!schemaClient) {
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
        const result = await schemaClient.getTableSchema(tableName)
        return {
          content:
            result || `Table '${tableName}' not found or schema unavailable`,
        }
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
        setStatus(getStatusFromCategory(category as DocCategory))
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
  schemaClient: SchemaToolsClient | undefined,
  conversationHistory: Array<MessageParam>,
  model: string,
  setStatus: StatusCallback,
  abortSignal?: AbortSignal,
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
        schemaClient,
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

  const followUpMessage = await createAnthropicMessage(anthropic, {
    model,
    tools: schemaClient ? ALL_TOOLS : DOC_TOOLS,
    messages: updatedHistory,
    temperature: 0.3,
  })

  if (followUpMessage.stop_reason === "tool_use") {
    return handleToolCalls(
      followUpMessage,
      anthropic,
      schemaClient,
      updatedHistory,
      model,
      setStatus,
      abortSignal,
    )
  }

  return followUpMessage
}

const extractOpenAIToolCalls = (
  response: OpenAI.Responses.Response,
): { id: string; name: string; arguments: unknown }[] => {
  const calls = []
  for (const item of response.output) {
    if (item?.type === "function_call") {
      const args =
        typeof item.arguments === "string"
          ? safeJsonParse(item.arguments)
          : item.arguments || {}
      calls.push({ id: item.call_id, name: item.name, arguments: args })
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
  responseFormat: { format: ResponseTextConfig }
  postProcess?: (formatted: T) => unknown
}

interface AnthropicFlowConfig<T> {
  systemInstructions: string
  initialUserContent: string
  formattingPrompt: string
  postProcess?: (formatted: T) => unknown
}

interface ExecuteAnthropicFlowParams<T> {
  anthropic: Anthropic
  model: string
  config: AnthropicFlowConfig<T>
  settings: AiAssistantSettings
  schemaClient?: SchemaToolsClient
  setStatus: StatusCallback
  abortSignal?: AbortSignal
}

interface ExecuteOpenAIFlowParams<T> {
  openai: OpenAI
  model: string
  config: OpenAIFlowConfig<T>
  settings: AiAssistantSettings
  schemaClient?: SchemaToolsClient
  setStatus: StatusCallback
  abortSignal?: AbortSignal
}

const executeOpenAIFlow = async <T>({
  openai,
  model,
  config,
  settings,
  schemaClient,
  setStatus,
  abortSignal,
}: ExecuteOpenAIFlowParams<T>): Promise<T | AiAssistantAPIError> => {
  let input:
    | OpenAI.Responses.ResponseInput
    | OpenAI.Responses.ResponseFunctionToolCallOutputItem[] = [
    {
      role: "user",
      content: config.initialUserContent,
    },
  ]

  const openaiTools = toOpenAIFunctions(
    settings.grantSchemaAccess && schemaClient ? ALL_TOOLS : DOC_TOOLS,
  )
  if (settings.grantSchemaAccess && schemaClient) {
    openaiTools.push(...toOpenAIFunctions(SCHEMA_TOOLS))
  }

  let lastResponse = await openai.responses.create({
    model,
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
        schemaClient,
        setStatus,
      )
      tool_outputs.push({
        id: tc.id,
        type: "function_call_output" as const,
        call_id: tc.id,
        output: exec.content,
      })
    }
    input = [...input, ...tool_outputs]
    lastResponse = await openai.responses.create({
      model,
      instructions: config.systemInstructions,
      input,
      tools: openaiTools,
      text: config.responseFormat as ResponseTextConfig,
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
  try {
    const json = JSON.parse(rawOutput) as T
    setStatus(null)
    if (config.postProcess) {
      return config.postProcess(json) as T
    }
    return json
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
  settings,
  schemaClient,
  setStatus,
  abortSignal,
}: ExecuteAnthropicFlowParams<T>): Promise<T | AiAssistantAPIError> => {
  const initialMessages = [
    { role: "user" as const, content: config.initialUserContent },
  ]

  const message = await createAnthropicMessage(anthropic, {
    model,
    system: config.systemInstructions,
    tools: settings.grantSchemaAccess && schemaClient ? ALL_TOOLS : DOC_TOOLS,
    messages: initialMessages,
    temperature: 0.3,
  })

  const response =
    message.stop_reason === "tool_use"
      ? await handleToolCalls(
          message,
          anthropic,
          schemaClient,
          initialMessages,
          settings.model,
          setStatus,
          abortSignal,
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
  setStatus(AIOperationStatus.FormattingResponse)

  const responseMessage = response as Anthropic.Messages.Message
  const formattingResponse = await createAnthropicMessage(anthropic, {
    model: settings.model,
    messages: [
      { role: "assistant", content: responseMessage.content },
      { role: "user", content: config.formattingPrompt },
      { role: "assistant", content: "{" },
    ],
    temperature: 0.3,
  })

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
    if (config.postProcess) {
      return config.postProcess(json) as T
    }
    return json
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
  schemaClient,
  setStatus,
  abortSignal,
}: {
  query: Request
  settings: AiAssistantSettings
  schemaClient?: SchemaToolsClient
  setStatus: StatusCallback
  abortSignal?: AbortSignal
}): Promise<AiAssistantExplanation | AiAssistantAPIError> => {
  if (!settings.apiKey || !query) {
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
  setStatus(AIOperationStatus.Processing)

  return tryWithRetries(
    async () => {
      const clients = createProviderClients(settings)
      const content = query.selection
        ? `Explain this portion of the query:\n\n\`\`\`sql\n${query.selection.queryText}\n\`\`\` within this query:\n\n\`\`\`sql\n${query.query}\n\`\`\` with 2-4 sentences`
        : `Explain this SQL query with 2-4 sentences:\n\n\`\`\`sql\n${query.query}\n\`\`\``

      if (clients.provider === "openai") {
        return await executeOpenAIFlow<{ explanation: string }>({
          openai: clients.openai,
          model: settings.model,
          config: {
            systemInstructions: getExplainQueryPrompt(
              settings.grantSchemaAccess,
            ),
            initialUserContent: content,
            responseFormat: { format: ExplainFormat },
          },
          settings,
          schemaClient,
          setStatus,
          abortSignal,
        })
      }

      return await executeAnthropicFlow<{ explanation: string }>({
        anthropic: clients.anthropic,
        model: settings.model,
        config: {
          systemInstructions: getExplainQueryPrompt(settings.grantSchemaAccess),
          initialUserContent: content,
          formattingPrompt:
            'Please give the 2-4 sentences summary of this query explanation in format { "explanation": "The summarized explanation" }. The result should be a valid JSON string.',
        },
        settings,
        schemaClient,
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
  settings,
  schemaClient,
  setStatus,
  abortSignal,
}: {
  description: string
  settings: AiAssistantSettings
  schemaClient?: SchemaToolsClient
  setStatus: StatusCallback
  abortSignal?: AbortSignal
}): Promise<GeneratedSQL | AiAssistantAPIError> => {
  if (!settings.apiKey || !description) {
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
  setStatus(AIOperationStatus.Processing)

  return tryWithRetries(
    async () => {
      const clients = createProviderClients(settings)
      const initialUserContent = `For the following description, generate the corresponding QuestDB SQL query and 2-4 sentences explanation:\n\n\`\`\`\n${description}\n\`\`\``
      const postProcess = (formatted: { sql: string; explanation: string }) => {
        if (!formatted || !formatted.sql) {
          return { sql: "", explanation: formatted?.explanation || "" }
        }
        return {
          sql: normalizeSql(formatted.sql),
          explanation: formatted.explanation || "",
        }
      }

      if (clients.provider === "openai") {
        return await executeOpenAIFlow<{ sql: string; explanation: string }>({
          openai: clients.openai,
          model: settings.model,
          config: {
            systemInstructions: getGenerateSQLPrompt(
              settings.grantSchemaAccess,
            ),
            initialUserContent,
            responseFormat: { format: GeneratedSQLFormat },
            postProcess,
          },
          settings,
          schemaClient,
          setStatus,
          abortSignal,
        })
      }

      return await executeAnthropicFlow<{ sql: string; explanation: string }>({
        anthropic: clients.anthropic,
        model: settings.model,
        config: {
          systemInstructions: getGenerateSQLPrompt(settings.grantSchemaAccess),
          initialUserContent,
          formattingPrompt:
            'Return a JSON string with the following structure:\n{ "sql": "The generated SQL query", "explanation": "A brief explanation of the query" }. The result should be a valid JSON string.',
          postProcess,
        },
        settings,
        schemaClient,
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
  settings,
  schemaClient,
  setStatus,
  abortSignal,
  word,
}: {
  query: string
  errorMessage: string
  settings: AiAssistantSettings
  schemaClient?: SchemaToolsClient
  setStatus: StatusCallback
  abortSignal?: AbortSignal
  word: string | null
}): Promise<Partial<GeneratedSQL> | AiAssistantAPIError> => {
  if (!settings.apiKey || !query || !errorMessage) {
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
  setStatus(AIOperationStatus.Processing)

  return tryWithRetries(
    async () => {
      const clients = createProviderClients(settings)
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
      }) => {
        return {
          ...(formatted?.sql
            ? { sql: normalizeSql(formatted.sql, false) }
            : {}),
          explanation: formatted?.explanation || "",
        }
      }

      if (clients.provider === "openai") {
        return await executeOpenAIFlow<{ explanation: string; sql?: string }>({
          openai: clients.openai,
          model: settings.model,
          config: {
            systemInstructions: getFixQueryPrompt(settings.grantSchemaAccess),
            initialUserContent,
            responseFormat: { format: FixSQLFormat },
            postProcess,
          },
          settings,
          schemaClient,
          setStatus,
          abortSignal,
        })
      }

      return await executeAnthropicFlow<{ explanation: string; sql?: string }>({
        anthropic: clients.anthropic,
        model: settings.model,
        config: {
          systemInstructions: getFixQueryPrompt(settings.grantSchemaAccess),
          initialUserContent,
          formattingPrompt:
            'Return a JSON string with the following structure:\n{ "sql": "The fixed SQL query", "explanation": "What was wrong and how it was fixed" }, if it should not be fixed, return a JSON string with the following structure:\n{"explanation": "The explanation of why it was failed" }. The result should be a valid JSON string.',
          postProcess,
        },
        settings,
        schemaClient,
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
  settings: AiAssistantSettings
  setStatus: StatusCallback
}): Promise<TableSchemaExplanation | AiAssistantAPIError> => {
  if (!settings.apiKey) {
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
    const message = await createAnthropicMessage(anthropic, {
      model: settings.model,
      messages: [
        {
          role: "user" as const,
          content: getExplainSchemaPrompt(tableName, schema, isMatView),
        },
        {
          role: "assistant" as const,
          content: '{"',
        },
      ],
      temperature: 0.3,
    })

    const fullContent =
      '{"' +
      message.content.reduce((acc, block) => {
        if (block.type === "text" && "text" in block) {
          acc += block.text
        }
        return acc
      }, "")

    try {
      const json = JSON.parse(fullContent) as TableSchemaExplanation
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
  const message = await anthropic.messages.create({
    ...params,
    stream: false,
    max_tokens: params.max_tokens ?? 8192,
  })

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
      message: `API error: ${error.message}`,
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
        model,
        input: [{ role: "user", content: "Test" }],
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
