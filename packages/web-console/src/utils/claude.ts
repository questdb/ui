import Anthropic from '@anthropic-ai/sdk'
import { Client } from './questdb/client'
import { Type } from './questdb/types'
import type { AiAssistantSettings } from '../providers/LocalStorageProvider/types'
import { formatSql } from './formatSql'
import type { Request } from '../scenes/Editor/Monaco/utils'
import { AIOperationStatus } from '../providers/AIStatusProvider'
import { 
  getQuestDBTableOfContents, 
  getSpecificDocumentation,
  DocCategory 
} from './questdbDocsRetrieval'

export interface ClaudeAPIError {
  type: 'rate_limit' | 'invalid_key' | 'network' | 'unknown' | 'aborted'
  message: string
  details?: any
}

export interface ClaudeExplanation {
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
  getTables: () => Promise<Array<{ name: string; type: 'table' | 'matview' }>>
  getTableSchema: (tableName: string) => Promise<string | null>
}

type StatusCallback = (status: AIOperationStatus | null) => void

const getStatusFromCategory = (category: DocCategory) => {
  switch (category) {
    case 'functions':
      return AIOperationStatus.InvestigatingFunctions
    case 'operators':
      return AIOperationStatus.InvestigatingOperators
    case 'sql':
      return AIOperationStatus.InvestigatingKeywords
    default:
      return null
  }
}

const SCHEMA_TOOLS = [
  {
    name: 'get_tables',
    description: 'Get a list of all tables and materialized views in the QuestDB database',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_table_schema',
    description: 'Get the full schema definition (DDL) for a specific table or materialized view',
    input_schema: {
      type: 'object' as const,
      properties: {
        table_name: {
          type: 'string' as const,
          description: 'The name of the table or materialized view to get schema for',
        },
      },
      required: ['table_name'],
    },
  },
]

const DOC_TOOLS = [
  {
    name: 'get_questdb_toc',
    description: 'Get a table of contents listing all available QuestDB functions, operators, and SQL keywords. Use this first to see what documentation is available before requesting specific items.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_questdb_documentation',
    description: 'Get documentation for specific QuestDB functions, operators, or SQL keywords. This is much more efficient than loading all documentation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string' as const,
          enum: ['functions', 'operators', 'sql'],
          description: 'The category of documentation to retrieve',
        },
        items: {
          type: 'array' as const,
          items: {
            type: 'string' as const,
          },
          description: 'List of specific function names, operators, or SQL keywords to get documentation for',
        },
      },
      required: ['category', 'items'],
    },
  },
]

const ALL_TOOLS = [...SCHEMA_TOOLS, ...DOC_TOOLS]

export function isClaudeError(response: ClaudeAPIError | ClaudeExplanation | GeneratedSQL | Partial<GeneratedSQL>)  {
  if ('type' in response && 'message' in response) {
    return true
  }
  return false
}

export function createSchemaClient(
  tables: Array<{ table_name: string; matView: boolean }>,
  questClient: Client
): SchemaToolsClient {
  return {
    async getTables(): Promise<Array<{ name: string; type: 'table' | 'matview' }>> {
      return tables.map(table => ({
        name: table.table_name,
        type: table.matView ? 'matview' : 'table' as const
      }))
    },

    async getTableSchema(tableName: string): Promise<string | null> {
      try {
        const table = tables.find(t => t.table_name === tableName)
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
    }
  }
}

const getExplainQueryPrompt = (grantSchemaAccess: boolean) => `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database. When given a QuestDB SQL query, explain what it does in clear, concise plain English.

Focus on the business logic and what the query achieves, not the SQL syntax itself. Pay special attention to QuestDB-specific features such as:
- Time-series operations (SAMPLE BY, LATEST ON, designated timestamp columns)
- Time-based filtering and aggregations
- Real-time data ingestion patterns
- Performance optimizations specific to time-series data

You have access to tools that can help you understand QuestDB features:
- get_questdb_toc: Get a table of contents of all QuestDB documentation (USE THIS FIRST!)
- get_questdb_documentation: Get specific documentation for functions, operators, or SQL keywords
${grantSchemaAccess ? `- get_tables: Get a list of all tables and materialized views
- get_table_schema: Get the full DDL schema for a specific table` : ''}

Refer to QuestDB documentation about functions, operators
IMPORTANT: For documentation, use a two-phase approach:
1. First use get_questdb_toc to see what's available
2. Then use get_questdb_documentation to get specific items you need

Example: To understand SAMPLE BY:
- First: get_questdb_toc → find "sample_by" in SQL section
- Then: get_questdb_documentation(category="sql", items=["sample_by"])`

const getGenerateSQLPrompt = (grantSchemaAccess: boolean) => `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database. 
When given a natural language description, generate the corresponding QuestDB SQL query.

Important guidelines:
- Generate only valid QuestDB SQL syntax referring to the documentation
- Use appropriate time-series functions (SAMPLE BY, LATEST ON, etc.) and common table expressions when relevant
- Follow QuestDB best practices for performance referring to the documentation
- Use proper timestamp handling for time-series data
- Use correct data types and functions specific to QuestDB referring to the documentation. Do not use any word that is not in the documentation.

You have access to tools that can help you understand QuestDB features:
- get_questdb_toc: Get a table of contents of all QuestDB documentation
- get_questdb_documentation: Get specific documentation for functions, operators, or SQL keywords
${grantSchemaAccess ? `- get_tables: Get a list of all tables and materialized views
- get_table_schema: Get the full DDL schema for a specific table` : ''}

CRITICAL: Always follow this two-phase documentation approach:
1. Use get_questdb_toc to see available functions/keywords/operators
2. Use get_questdb_documentation to get details for specific items you'll use

Example workflow:
- Need a time function? → get_questdb_toc → find relevant functions → get_questdb_documentation(category="functions", items=["dateadd", "datediff"])
- Need SAMPLE BY syntax? → get_questdb_documentation(category="sql", items=["sample_by"])
`

const getFixQueryPrompt = (grantSchemaAccess: boolean) => `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database.
When given a QuestDB SQL query with an error, fix the query to resolve the error.

Important guidelines:
1. Analyze the error message carefully to understand what went wrong
2. Generate only valid QuestDB SQL syntax referring to the documentation
3. Preserve the original intent of the query while fixing the error
4. Follow QuestDB best practices and syntax rules referring to the documentation
5. Consider common issues like:
   - Missing or incorrect column names
   - Invalid syntax for time-series operations
   - Data type mismatches
   - Missing quotes around string literals
   - Incorrect function usage

You have access to tools that can help you understand QuestDB features:
- get_questdb_toc: Get a table of contents of all QuestDB documentation
- get_questdb_documentation: Get specific documentation for functions, operators, or SQL keywords
${grantSchemaAccess ? `- get_tables: Get a list of all tables and materialized views
- get_table_schema: Get the full DDL schema for a specific table` : ''}

Do not use any function, operator, or SQL keyword that is not in the documentation.
When fixing queries with errors:
1. If error mentions unknown function/keyword → use get_questdb_toc to check available options
2. Get documentation only for the specific item causing the error

Example: "Unknown function 'date_diff'" → get_questdb_toc → see it's actually "datediff" → get_questdb_documentation(category="functions", items=["datediff"])
`

const getExplainSchemaPrompt = (tableName: string, schema: string, isMatView: boolean) => `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database.
Briefly explain the following ${isMatView ? 'materialized view' : 'table'} schema in detail. Include:
- The purpose of the ${isMatView ? 'materialized view' : 'table'}
- What each column represents and its data type
- Any important properties like WAL enablement, partitioning strategy, designated timestamps
- Any performance or storage considerations

${isMatView ? 'Materialized View' : 'Table'} Name: ${tableName}

Schema:
\`\`\`sql
${schema}
\`\`\`

Provide a short explanation that helps developers understand how to use this ${isMatView ? 'materialized view' : 'table'}.

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
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
  }
  lastRequestTime = Date.now()
}

const isNonRetryableError = (error: any) => {
  return error instanceof RefusalError || 
         error instanceof MaxTokensError || 
         error instanceof Anthropic.AuthenticationError
}

async function handleToolCalls(
  message: Anthropic.Messages.Message,
  anthropic: Anthropic,
  schemaClient: SchemaToolsClient,
  conversationHistory: any[],
  model: string,
  setStatus: StatusCallback,
  abortSignal?: AbortSignal
): Promise<Anthropic.Messages.Message | ClaudeAPIError> {
  const toolUseBlocks = message.content.filter(block => block.type === 'tool_use')
  const toolResults = []

  if (abortSignal?.aborted) {
    return {
      type: 'aborted',
      message: 'Operation was cancelled'
    } as ClaudeAPIError
  }

  for (const toolUse of toolUseBlocks) {
    if ('name' in toolUse) {
      let result: any

      try {
        switch (toolUse.name) {
          case 'get_tables':
            setStatus(AIOperationStatus.RetrievingTables)
            if (!schemaClient) {
              toolResults.push({
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                content: 'Error: Schema access is not granted. This tool is not available.',
                is_error: true
              })
            } else {
              result = await schemaClient.getTables()
              toolResults.push({
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                content: JSON.stringify(result, null, 2)
              })
            }
            break

          case 'get_table_schema':
            setStatus(AIOperationStatus.InvestigatingTableSchema)
            const tableName = (toolUse.input as any)?.table_name
            if (!schemaClient) {
              toolResults.push({
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                content: 'Error: Schema access is not granted. This tool is not available.',
                is_error: true
              })
            } else if (!tableName) {
              toolResults.push({
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                content: 'Error: table_name parameter is required',
                is_error: true
              })
            } else {
              result = await schemaClient.getTableSchema(tableName)
              toolResults.push({
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                content: result || `Table '${tableName}' not found or schema unavailable`
              })
            }
            break

          case 'get_questdb_toc':
            setStatus(AIOperationStatus.RetrievingDocumentation)
            const tocContent = getQuestDBTableOfContents()
            toolResults.push({
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content: tocContent
            })
            break

          case 'get_questdb_documentation':
            const { category, items } = (toolUse.input as any) || {}
            if (!category || !items || !Array.isArray(items)) {
              toolResults.push({
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                content: 'Error: category and items parameters are required',
                is_error: true
              })
            } else {
              setStatus(getStatusFromCategory(category as DocCategory))
              const documentation = getSpecificDocumentation(category as DocCategory, items)
              toolResults.push({
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                content: documentation
              })
            }
            break

          default:
            toolResults.push({
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content: `Unknown tool: ${toolUse.name}`,
              is_error: true
            })
        }
      } catch (error) {
        toolResults.push({
          type: 'tool_result' as const,
          tool_use_id: toolUse.id,
          content: `Tool execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          is_error: true
        })
      }
    }
  }

  const updatedHistory = [
    ...conversationHistory,
    {
      role: 'assistant' as const,
      content: message.content
    },
    {
      role: 'user' as const,
      content: toolResults
    }
  ]

  const followUpMessage = await createAnthropicMessage(anthropic, {
    model,
    tools: schemaClient ? ALL_TOOLS : DOC_TOOLS,
    messages: updatedHistory,
    temperature: 0.3,
  })

  if (followUpMessage.stop_reason === 'tool_use') {
    return handleToolCalls(followUpMessage, anthropic, schemaClient, updatedHistory, model, setStatus, abortSignal)
  }

  return followUpMessage
}

const tryWithRetries = async <T>(fn: () => Promise<T>, setStatus: StatusCallback, abortSignal?: AbortSignal): Promise<T | ClaudeAPIError> => {
  let retries = 0
  while (retries <= MAX_RETRIES) {
    try {
      if (abortSignal?.aborted) {
        return {
          type: 'aborted',
          message: 'Operation was cancelled'
        } as ClaudeAPIError
      }

      return await fn()
    } catch (error) {
      retries++
      if (retries > MAX_RETRIES || isNonRetryableError(error)) {
        setStatus(null)
        return handleClaudeError(error)
      }

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries))
    }
  }

  setStatus(null)
  return {
    type: 'unknown',
    message: `Failed to get response after ${retries} retries`
  }
}

export const explainQuery = async ({
  query,
  settings,
  schemaClient,
  setStatus,
  abortSignal,
}: {
  query: Request,
  settings: AiAssistantSettings,
  schemaClient?: SchemaToolsClient,
  setStatus: StatusCallback,
  abortSignal?: AbortSignal
}): Promise<ClaudeExplanation | ClaudeAPIError> => {
  if (!settings.apiKey || !query) {
    return {
      type: 'invalid_key',
      message: 'API key or query is missing'
    }
  }

  await handleRateLimit()
  if (abortSignal?.aborted) {
    return {
      type: 'aborted',
      message: 'Operation was cancelled'
    } as ClaudeAPIError
  }
  setStatus(AIOperationStatus.Processing)

  return tryWithRetries(async () => {
    const anthropic = new Anthropic({
      apiKey: settings.apiKey,
      dangerouslyAllowBrowser: true
    })
    const content = query.selection
      ? `Explain this portion of the query:\n\n\`\`\`sql\n${query.selection.queryText}\n\`\`\` in this query:\n\n\`\`\`sql\n${query.query}\n\`\`\` with 2-4 sentences`
      : `Explain this SQL query with 2-4 sentences:\n\n\`\`\`sql\n${query.query}\n\`\`\``

    const initialMessages = [
      {
        role: 'user' as const,
        content
      }
    ]

    const message = await createAnthropicMessage(anthropic, {
      model: settings.model,
      system: getExplainQueryPrompt(settings.grantSchemaAccess),
      tools: settings.grantSchemaAccess && schemaClient ? ALL_TOOLS : DOC_TOOLS,
      messages: initialMessages,
      temperature: 0.3,
    })

    const response = settings.grantSchemaAccess && schemaClient && message.stop_reason === 'tool_use'
      ? await handleToolCalls(message, anthropic, schemaClient, initialMessages, settings.model, setStatus, abortSignal)
      : message

    const responseError = response as ClaudeAPIError
    if (responseError.type === 'aborted') {
      return responseError
    }

    const responseMessage = response as Anthropic.Messages.Message
    const explanation = responseMessage.content
      .filter(block => block.type === 'text')
      .map(block => {
        if ('text' in block) {
          return block.text
        }
        return ''
      })
      .join('\n')
      .trim()

    if (abortSignal?.aborted) {
      return {
        type: 'aborted',
        message: 'Operation was cancelled'
      } as ClaudeAPIError
    }
    setStatus(AIOperationStatus.FormattingResponse)

    const formattingResponse = await createAnthropicMessage(anthropic, {
      model: settings.model,
      messages: [
        {
          role: 'assistant' as const,
          content: explanation
        },
        {
          role: 'user' as const,
          content: 'Return a JSON string with the following structure:\n{ "explanation": "The explanation of the query" }'
        },
        {
          role: 'assistant' as const,
          content: '{'
        },
      ],
    })

    const fullContent = formattingResponse.content.reduce((acc, block) => {
      if (block.type === 'text' && 'text' in block) {
        acc += block.text
      }
      return acc
    }, '{')

    try {
      if (abortSignal?.aborted) {
        return {
          type: 'aborted',
          message: 'Operation was cancelled'
        } as ClaudeAPIError
      }
      const json = JSON.parse(fullContent)
      setStatus(null)
      return { explanation: json.explanation }
    } catch (error) {
      setStatus(null)
      return {
        type: 'unknown',
        message: 'Failed to parse assistant response.'
      } as ClaudeAPIError
    }
  }, setStatus, abortSignal)
}

export const generateSQL = async ({
  description,
  settings,
  schemaClient,
  setStatus,
  abortSignal,
}: {
  description: string,
  settings: AiAssistantSettings,
  schemaClient?: SchemaToolsClient,
  setStatus: StatusCallback,
  abortSignal?: AbortSignal
}): Promise<GeneratedSQL | ClaudeAPIError> => {
  if (!settings.apiKey || !description) {
    return {
      type: 'invalid_key',
      message: 'API key or description is missing'
    }
  }

  await handleRateLimit()
  if (abortSignal?.aborted) {
    return {
      type: 'aborted',
      message: 'Operation was cancelled'
    } as ClaudeAPIError
  }
  setStatus(AIOperationStatus.Processing)

  return tryWithRetries(async () => {
    const anthropic = new Anthropic({
      apiKey: settings.apiKey,
      dangerouslyAllowBrowser: true
    })

    const initialMessages = [
      {
        role: 'user' as const,
        content: description
      },
    ]

    const message = await createAnthropicMessage(anthropic, {
      model: settings.model,
      system: getGenerateSQLPrompt(settings.grantSchemaAccess),
      tools: settings.grantSchemaAccess && schemaClient ? ALL_TOOLS : DOC_TOOLS,
      messages: initialMessages,
      temperature: 0.2,
    })

    const response = settings.grantSchemaAccess && schemaClient && message.stop_reason === 'tool_use'
      ? await handleToolCalls(message, anthropic, schemaClient, initialMessages, settings.model, setStatus, abortSignal)
      : message
    
    const responseError = response as ClaudeAPIError
    if (responseError.type === 'aborted') {
      return responseError
    }

    const responseMessage = response as Anthropic.Messages.Message
    
    if (abortSignal?.aborted) {
      return {
        type: 'aborted',
        message: 'Operation was cancelled'
      } as ClaudeAPIError
    }
    setStatus(AIOperationStatus.FormattingResponse)
    
    const formattingResponse = await createAnthropicMessage(anthropic, {
      model: settings.model,
      messages: [
        {
          role: 'assistant' as const,
          content: responseMessage.content
        },
        {
          role: 'user' as const,
          content: 'Return a JSON string with the following structure:\n{ "sql": "The generated SQL query", "explanation": "A brief explanation of the query" }'
        },
        {
          role: 'assistant' as const,
          content: '{'
        }
      ],
    })
    
    const fullContent = formattingResponse.content.reduce((acc, block) => {
      if (block.type === 'text' && 'text' in block) {
        acc += block.text
      }
      return acc
    }, '{')

    try {
      if (abortSignal?.aborted) {
        return {
          type: 'aborted',
          message: 'Operation was cancelled'
        } as ClaudeAPIError
      }
      setStatus(null)
      const json = JSON.parse(fullContent)
      let sql = formatSql(json.sql) || ''
      if (sql) {
        sql = sql.trim()
        if (!sql.endsWith(';')) {
          sql = sql + ';'
        }
      }
      return {
        sql,
        explanation: json.explanation || ''
      }
    } catch (error) {
      setStatus(null)
      return {
        type: 'unknown',
        message: 'Failed to parse assistant response.'
      } as ClaudeAPIError
    }
  }, setStatus, abortSignal)
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
  query: string,
  errorMessage: string,
  settings: AiAssistantSettings,
  schemaClient?: SchemaToolsClient,
  setStatus: StatusCallback,
  abortSignal?: AbortSignal,
  word: string | null,
}): Promise<Partial<GeneratedSQL> | ClaudeAPIError> => {
  if (!settings.apiKey || !query || !errorMessage) {
    return {
      type: 'invalid_key',
      message: 'API key, query, or error message is missing'
    }
  }

  await handleRateLimit()
  if (abortSignal?.aborted) {
    return {
      type: 'aborted',
      message: 'Operation was cancelled'
    } as ClaudeAPIError
  }
  setStatus(AIOperationStatus.Processing)

  return tryWithRetries(async () => {
    const anthropic = new Anthropic({
      apiKey: settings.apiKey,
      dangerouslyAllowBrowser: true
    })

    const initialMessages = [
      {
        role: 'user' as const,
        content: `SQL Query:
\`\`\`sql
${query}
\`\`\`

Error Message:
\`\`\`
${errorMessage}
\`\`\`

Analyze the error and fix the query if possible, otherwise provide an explanation why it was failed.
${word ? `The error occurred at word: ${word}` : ''}`
      }
    ]

    const message = await createAnthropicMessage(anthropic, {
      model: settings.model,
      system: getFixQueryPrompt(settings.grantSchemaAccess),
      tools: settings.grantSchemaAccess && schemaClient ? ALL_TOOLS : DOC_TOOLS,
      messages: initialMessages,
      temperature: 0.2,
    })

    const response = settings.grantSchemaAccess && schemaClient && message.stop_reason === 'tool_use'
      ? await handleToolCalls(message, anthropic, schemaClient, initialMessages, settings.model, setStatus, abortSignal)
      : message
    
    const responseError = response as ClaudeAPIError
    if (responseError.type === 'aborted') {
      return responseError
    }

    const responseMessage = response as Anthropic.Messages.Message
    
    if (abortSignal?.aborted) {
      return {
        type: 'aborted',
        message: 'Operation was cancelled'
      } as ClaudeAPIError
    }
    setStatus(AIOperationStatus.FormattingResponse)
    
    const formattingResponse = await createAnthropicMessage(anthropic, {
      model: settings.model,
      messages: [
        {
          role: 'assistant' as const,
          content: responseMessage.content
        },
        {
          role: 'user' as const,
          content: 'If the query needs to be fixed, return a JSON string with the following structure:\n{"sql": "The fixed SQL query", "explanation": "What was wrong and how it was fixed" }, if it should not be fixed, return a JSON string with the following structure:\n{"explanation": "The explanation of why it was failed" }'
        },
        {
          role: 'assistant' as const,
          content: '{'
        }
      ],
    })
    
    const fullContent = formattingResponse.content.reduce((acc, block) => {
      if (block.type === 'text' && 'text' in block) {
        acc += block.text
      }
      return acc
    }, '{')

    try {
      if (abortSignal?.aborted) {
        return {
          type: 'aborted',
          message: 'Operation was cancelled'
        } as ClaudeAPIError
      }
      setStatus(null)
      const json = JSON.parse(fullContent)
      let sql = json.sql
      if (sql) {
        sql = sql.trim()
        if (sql.endsWith(';')) {
          sql = sql.slice(0, -1)
        }
      }
      return {
        ...(sql ? { sql: formatSql(sql) } : {}),
        explanation: json.explanation || ''
      }
    } catch (error) {
      setStatus(null)
      return {
        type: 'unknown',
        message: 'Failed to parse assistant response.'
      } as ClaudeAPIError
    }
  }, setStatus, abortSignal)
}

class RefusalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RefusalError'
  }
}

class MaxTokensError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MaxTokensError'
  }
}

async function createAnthropicMessage(
  anthropic: Anthropic,
  params: Omit<Anthropic.MessageCreateParams, 'max_tokens'> & { max_tokens?: number }
): Promise<Anthropic.Messages.Message> {
  const message = await anthropic.messages.create({
    ...params,
    stream: false,
    max_tokens: params.max_tokens ?? 8192
  })
  
  if (message.stop_reason === 'refusal') {
    throw new RefusalError('The model refused to generate a response for this request.')
  }
  
  return message
}

function handleClaudeError(error: any): ClaudeAPIError {
  if (error instanceof RefusalError) {
    return {
      type: 'unknown',
      message: 'The model refused to generate a response for this request.',
      details: error.message
    }
  }

  if (error instanceof MaxTokensError) {
    return {
      type: 'unknown',
      message: 'The response exceeded the maximum token limit. Please try generating shorter queries or increase token limits.',
      details: error.message
    }
  }

  if (error instanceof Anthropic.AuthenticationError) {
    return {
      type: 'invalid_key',
      message: 'Invalid API key. Please check your Anthropic API key.',
      details: error.message
    }
  }

  if (error instanceof Anthropic.RateLimitError) {
    return {
      type: 'rate_limit',
      message: 'Rate limit exceeded. Please try again later.',
      details: error.message
    }
  }

  if (error instanceof Anthropic.APIConnectionError) {
    return {
      type: 'network',
      message: 'Network error. Please check your internet connection.',
      details: error.message
    }
  }

  if (error instanceof Anthropic.APIError) {
    return {
      type: 'unknown',
      message: `API error: ${error.message}`,
      details: error
    }
  }

  return {
    type: 'unknown',
    message: 'An unexpected error occurred. Please try again.',
    details: error
  }
}

export const explainTableSchema = async ({
  tableName,
  schema,
  isMatView,
  settings,
  setStatus,
}: {
  tableName: string,
  schema: string,
  isMatView: boolean,
  settings: AiAssistantSettings,
  setStatus: StatusCallback,
}): Promise<TableSchemaExplanation | ClaudeAPIError> => {
  if (!settings.apiKey || !schema) {
    return {
      type: 'invalid_key',
      message: 'API key or schema is missing'
    }
  }

  if (!settings.grantSchemaAccess) {
    return {
      type: 'unknown',
      message: 'Schema access is not granted to the AI Assistant'
    }
  }

  await handleRateLimit()
  setStatus(AIOperationStatus.Processing)

  return tryWithRetries(async () => {
    const anthropic = new Anthropic({
      apiKey: settings.apiKey,
      dangerouslyAllowBrowser: true
    })

    const message = await createAnthropicMessage(anthropic, {
      model: settings.model,
      messages: [
        {
          role: 'user' as const,
          content: getExplainSchemaPrompt(tableName, schema, isMatView)
        },
        {
          role: 'assistant' as const,
          content: '{"'
        }
      ],
      temperature: 0.3,
    })

    const fullContent = '{"' + message.content.reduce((acc, block) => {
      if (block.type === 'text' && 'text' in block) {
        acc += block.text
      }
      return acc
    }, '')

    try {
      const json = JSON.parse(fullContent)
      setStatus(null)
      return { 
        explanation: json.explanation || '',
        columns: json.columns || [],
        storage_details: json.storage_details || []
      }
    } catch (error) {
      setStatus(null)
      return {
        type: 'unknown',
        message: 'Failed to parse assistant response.'
      } as ClaudeAPIError
    }
  }, setStatus)
}

export const formatExplanationAsComment = (explanation: string, prefix: string = 'AI Explanation'): string => {
  if (!explanation) return ''
  
  const MAX_LINE_LENGTH = 80 // Maximum characters per line
  const COMMENT_PREFIX = ' * ' // 3 characters
  const MAX_CONTENT_LENGTH = MAX_LINE_LENGTH - COMMENT_PREFIX.length
  
  const wrapLine = (text: string): string[] => {
    if (text.length <= MAX_CONTENT_LENGTH) {
      return [text]
    }
    
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''
    
    for (const word of words) {
      // If adding this word would exceed the limit
      if (currentLine.length + word.length + 1 > MAX_CONTENT_LENGTH) {
        if (currentLine.length > 0) {
          lines.push(currentLine.trim())
          currentLine = word
        } else {
          // Single word is too long, break it
          if (word.length > MAX_CONTENT_LENGTH) {
            const chunks = word.match(new RegExp(`.{1,${MAX_CONTENT_LENGTH}}`, 'g')) || [word]
            lines.push(...chunks.slice(0, -1))
            currentLine = chunks[chunks.length - 1]
          } else {
            currentLine = word
          }
        }
      } else {
        currentLine += (currentLine.length > 0 ? ' ' : '') + word
      }
    }
    
    if (currentLine.length > 0) {
      lines.push(currentLine.trim())
    }
    
    return lines
  }
  
  // Split explanation into paragraphs and wrap each line
  const paragraphs = explanation.split('\n')
  const wrappedLines: string[] = []
  
  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      wrappedLines.push('') // Preserve empty lines
    } else {
      const wrapped = wrapLine(paragraph.trim())
      wrappedLines.push(...wrapped)
    }
  }
  
  // Format as SQL comment
  const formattedLines = wrappedLines.map(line => ` * ${line}`)
  
  return `/*\n * ${prefix}:\n${formattedLines.join('\n')}\n */`
}

export const testApiKey = async (apiKey: string, model: string): Promise<{ valid: boolean; error?: string }> => {
  try {
    const anthropic = new Anthropic({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    })

    await createAnthropicMessage(anthropic, {
      model,
      messages: [
        {
          role: 'user',
          content: 'Test'
        }
      ],
      max_tokens: 10
    })

    return { valid: true }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return { 
        valid: false, 
        error: 'Invalid API key' 
      }
    }

    if (error instanceof Anthropic.RateLimitError) {
      return { 
        valid: true
      }
    }

    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Failed to validate API key' 
    }
  }
}