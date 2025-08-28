import Anthropic from '@anthropic-ai/sdk'
import { Client } from './questdb/client'
import { Type } from './questdb/types'
import type { AiAssistantSettings } from '../providers/LocalStorageProvider/types'
import { formatSql } from './formatSql'
import type { Request } from '../scenes/Editor/Monaco/utils'

export interface ClaudeAPIError {
  type: 'rate_limit' | 'invalid_key' | 'network' | 'unknown'
  message: string
  details?: any
}

export interface ClaudeExplanation {
  explanation: string
}

export interface GeneratedSQL {
  sql: string
  explanation?: string
}

export interface SchemaToolsClient {
  getTables: () => Promise<Array<{ name: string; type: 'table' | 'matview' }>>
  getTableSchema: (tableName: string) => Promise<string | null>
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

export function isClaudeError(response: ClaudeAPIError | ClaudeExplanation | GeneratedSQL)  {
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

${grantSchemaAccess ? `You have access to tools that can help you understand the database schema:
- get_tables: Get a list of all tables and materialized views
- get_table_schema: Get the full DDL schema for a specific table

Use these tools when the query references tables and it would be helpful to understand their structure for providing a better explanation.` : ''}

Do not use markdown formatting in your response.`

const getExplainErrorPrompt = (grantSchemaAccess: boolean) => `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database. When given a QuestDB SQL query and its error message, provide a clear explanation of:

1. What caused the error in simple terms
2. How to fix the issue with specific suggestions
3. QuestDB-specific considerations if relevant

Focus on practical solutions rather than technical jargon. Consider QuestDB-specific features such as:
- Time-series operations (SAMPLE BY, LATEST ON, designated timestamp columns)
- Data ingestion and table structure requirements
- Performance considerations for time-series queries
- QuestDB-specific SQL syntax and functions

${grantSchemaAccess ? `You have access to tools that can help you understand the database schema:
- get_tables: Get a list of all tables and materialized views
- get_table_schema: Get the full DDL schema for a specific table

Use these tools when the error might be related to table structure, column names, or data types.` : ''}

Keep explanations concise but actionable, providing specific steps to resolve the issue.`

const getGenerateSQLPrompt = (grantSchemaAccess: boolean) => `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database. 
When given a natural language description, generate the corresponding QuestDB SQL query.

Important guidelines:
1. Generate only valid QuestDB SQL syntax
2. Use appropriate time-series functions (SAMPLE BY, LATEST ON, etc.) when relevant
3. Follow QuestDB best practices for performance
4. Use proper timestamp handling for time-series data
5. Include appropriate WHERE clauses for time filtering when mentioned
6. Use correct data types and functions specific to QuestDB

${grantSchemaAccess ? `You have access to tools that can help you understand the database schema:
- get_tables: Get a list of all tables and materialized views
- get_table_schema: Get the full DDL schema for a specific table

Use these tools to ensure you generate queries with correct table and column names.` : ''}
`

const getFixQueryPrompt = (grantSchemaAccess: boolean) => `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database.
When given a QuestDB SQL query with an error, fix the query to resolve the error.

Important guidelines:
1. Analyze the error message carefully to understand what went wrong
2. Generate only valid QuestDB SQL syntax
3. Preserve the original intent of the query while fixing the error
4. Follow QuestDB best practices and syntax rules
5. Consider common issues like:
   - Missing or incorrect column names
   - Invalid syntax for time-series operations
   - Data type mismatches
   - Missing quotes around string literals
   - Incorrect function usage

${grantSchemaAccess ? `You have access to tools that can help you understand the database schema:
- get_tables: Get a list of all tables and materialized views
- get_table_schema: Get the full DDL schema for a specific table

Use these tools to verify correct table and column names, and to understand the data types.` : ''}
`

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

async function handleToolCalls(
  message: Anthropic.Messages.Message,
  anthropic: Anthropic,
  schemaClient: SchemaToolsClient,
  conversationHistory: Array<any> = [],
  model: string
): Promise<Anthropic.Messages.Message> {
  const toolUseBlocks = message.content.filter(block => block.type === 'tool_use')
  const toolResults = []

  for (const toolUse of toolUseBlocks) {
    if ('name' in toolUse) {
      let result: any

      try {
        switch (toolUse.name) {
          case 'get_tables':
            result = await schemaClient.getTables()
            toolResults.push({
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content: JSON.stringify(result, null, 2)
            })
            break

          case 'get_table_schema':
            const tableName = (toolUse.input as any)?.table_name
            if (!tableName) {
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

  const followUpMessage = await anthropic.messages.create({
    model,
    max_tokens: 1000,
    tools: SCHEMA_TOOLS,
    messages: updatedHistory,
    temperature: 0.3
  })

  if (followUpMessage.stop_reason === 'tool_use') {
    return handleToolCalls(followUpMessage, anthropic, schemaClient, updatedHistory, model)
  }

  return followUpMessage
}

const tryWithRetries = async <T>(fn: () => Promise<T>): Promise<T | ClaudeAPIError> => {
  let retries = 0
  while (retries <= MAX_RETRIES) {
    try {
      return await fn()
    } catch (error) {
      retries++
      
      if (retries > MAX_RETRIES) {
        return handleClaudeError(error)
      }

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries))
    }
  }

  return {
    type: 'unknown',
    message: `Failed to get response after ${retries} retries`
  }
}

export const explainQuery = async (
  query: Request,
  settings: AiAssistantSettings,
  schemaClient?: SchemaToolsClient
): Promise<ClaudeExplanation | ClaudeAPIError> => {
  if (!settings.apiKey || !query) {
    return {
      type: 'invalid_key',
      message: 'API key or query is missing'
    }
  }

  await handleRateLimit()

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

    const message = await anthropic.messages.create({
      model: settings.model,
      max_tokens: 1000,
      system: getExplainQueryPrompt(settings.grantSchemaAccess),
      tools: settings.grantSchemaAccess && schemaClient ? SCHEMA_TOOLS : undefined,
      messages: initialMessages,
      temperature: 0.3
    })

    const response = settings.grantSchemaAccess && schemaClient && message.stop_reason === 'tool_use'
      ? await handleToolCalls(message, anthropic, schemaClient, initialMessages, settings.model)
      : message

    const explanation = response.content
      .filter(block => block.type === 'text')
      .map(block => {
        if ('text' in block) {
          return block.text
        }
        return ''
      })
      .join('\n')
      .trim()

    const formattingResponse = await anthropic.messages.create({
      model: settings.model,
      max_tokens: 1000,
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
      ]
    })

    const fullContent = formattingResponse.content.reduce((acc, block) => {
      if (block.type === 'text' && 'text' in block) {
        acc += block.text
      }
      return acc
    }, '{')

    try {
      const json = JSON.parse(fullContent)
      return { explanation: json.explanation }
    } catch (error) {
      return {
        type: 'unknown',
        message: 'Failed to parse assistant response.'
      } as ClaudeAPIError
    }
  })
}

export const explainError = async (
  query: string,
  errorMessage: string,
  settings: AiAssistantSettings,
  schemaClient?: SchemaToolsClient
): Promise<ClaudeExplanation | ClaudeAPIError> => {
  if (!settings.apiKey || !query || !errorMessage) {
    return {
      type: 'invalid_key',
      message: 'API key, query, or error message is missing'
    }
  }

  await handleRateLimit()

  return tryWithRetries(async () => {
      const anthropic = new Anthropic({
        apiKey: settings.apiKey,
        dangerouslyAllowBrowser: true
      })

      const initialMessages = [
        {
          role: 'user' as const,
          content: `Please explain this QuestDB SQL error:

SQL Query:
\`\`\`sql
${query}
\`\`\`

Error Message:
\`\`\`
${errorMessage}
\`\`\`

What went wrong and how can I fix it?`
        }
      ]

      const message = await anthropic.messages.create({
        model: settings.model,
        max_tokens: 1000,
        system: getExplainErrorPrompt(settings.grantSchemaAccess),
        tools: settings.grantSchemaAccess && schemaClient ? SCHEMA_TOOLS : undefined,
        messages: initialMessages,
        temperature: 0.3
      })

      // Handle tool calls if schema access is granted
      const response = settings.grantSchemaAccess && schemaClient && message.stop_reason === 'tool_use'
        ? await handleToolCalls(message, anthropic, schemaClient, initialMessages, settings.model)
        : message
      
      const explanation = response.content
        .filter(block => block.type === 'text')
        .map(block => {
          if ('text' in block) {
            return block.text
          }
          return ''
        })
        .join('\n')
        .trim()

      return { explanation }
  })
}

export const generateSQL = async (
  description: string,
  settings: AiAssistantSettings,
  schemaClient?: SchemaToolsClient
): Promise<GeneratedSQL | ClaudeAPIError> => {
  if (!settings.apiKey || !description) {
    return {
      type: 'invalid_key',
      message: 'API key or description is missing'
    }
  }

  await handleRateLimit()

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

    const message = await anthropic.messages.create({
      model: settings.model,
      max_tokens: 1000,
      system: getGenerateSQLPrompt(settings.grantSchemaAccess),
      tools: settings.grantSchemaAccess && schemaClient ? SCHEMA_TOOLS : undefined,
      messages: initialMessages,
      temperature: 0.2 // Lower temperature for more consistent SQL generation
    })

    // Handle tool calls if schema access is granted
    const response = settings.grantSchemaAccess && schemaClient && message.stop_reason === 'tool_use'
      ? await handleToolCalls(message, anthropic, schemaClient, initialMessages, settings.model)
      : message
    
    const formattingResponse = await anthropic.messages.create({
      model: settings.model,
      max_tokens: 1000,
      messages: [
        {
          role: 'assistant' as const,
          content: response.content
        },
        {
          role: 'user' as const,
          content: 'Return a JSON string with the following structure:\n{ "sql": "The generated SQL query", "explanation": "A brief explanation of the query" }'
        },
        {
          role: 'assistant' as const,
          content: '{'
        }
      ]
    })
    const fullContent = formattingResponse.content.reduce((acc, block) => {
      if (block.type === 'text' && 'text' in block) {
        acc += block.text
      }
      return acc
    }, '{')

    try {
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
      return {
        type: 'unknown',
        message: 'Failed to parse assistant response.'
      } as ClaudeAPIError
    }
  })
}

export const fixQuery = async (
  query: string,
  errorMessage: string,
  settings: AiAssistantSettings,
  schemaClient?: SchemaToolsClient
): Promise<GeneratedSQL | ClaudeAPIError> => {
  if (!settings.apiKey || !query || !errorMessage) {
    return {
      type: 'invalid_key',
      message: 'API key, query, or error message is missing'
    }
  }
  return {
    sql: formatSql(`
      SELECT 
        timestamp, 
        symbol, 
        spread_bps(bids[1][1], asks[1][1]) spread_bps 
        FROM market_data 
        WHERE symbol IN ('GBPUSD', 'EURUSD') LIMIT 10`),
    explanation: "The original query used curly braces {} in the IN clause, which is incorrect SQL syntax. The fix replaced the curly braces with standard parentheses () in the IN clause and ensured string literals were properly enclosed in single quotes. This follows standard SQL syntax which QuestDB expects."
  }

  await handleRateLimit()

  return tryWithRetries(async () => {
    const anthropic = new Anthropic({
      apiKey: settings.apiKey,
      dangerouslyAllowBrowser: true
    })

    const initialMessages = [
      {
        role: 'user' as const,
        content: `Please fix this QuestDB SQL query based on the error:

SQL Query:
\`\`\`sql
${query}
\`\`\`

Error Message:
\`\`\`
${errorMessage}
\`\`\`

Fix the query to resolve this error.`
      }
    ]

    const message = await anthropic.messages.create({
      model: settings.model,
      max_tokens: 1000,
      system: getFixQueryPrompt(settings.grantSchemaAccess),
      tools: settings.grantSchemaAccess && schemaClient ? SCHEMA_TOOLS : undefined,
      messages: initialMessages,
      temperature: 0.2 // Lower temperature for more consistent fixes
    })

    // Handle tool calls if schema access is granted
    const response = settings.grantSchemaAccess && schemaClient && message.stop_reason === 'tool_use'
      ? await handleToolCalls(message, anthropic, schemaClient, initialMessages, settings.model)
      : message
    
    const formattingResponse = await anthropic.messages.create({
      model: settings.model,
      max_tokens: 1000,
      messages: [
        {
          role: 'assistant' as const,
          content: response.content
        },
        {
          role: 'user' as const,
          content: 'Return a JSON string with the following structure:\n{ "sql": "The fixed SQL query", "explanation": "What was wrong and how it was fixed" }'
        },
        {
          role: 'assistant' as const,
          content: '{'
        }
      ]
    })
    const fullContent = formattingResponse.content.reduce((acc, block) => {
      if (block.type === 'text' && 'text' in block) {
        acc += block.text
      }
      return acc
    }, '{')

    try {
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
      return {
        type: 'unknown',
        message: 'Failed to parse assistant response.'
      } as ClaudeAPIError
    }
  })
}

function handleClaudeError(error: any): ClaudeAPIError {
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

// Validate API key format (basic check)
export const isValidApiKeyFormat = (key: string): boolean => {
  // Anthropic API keys typically start with 'sk-ant-api' and are around 100+ chars
  return /^sk-ant-api\d{2}-[\w-]{90,}$/i.test(key)
}

// Test API key by making a simple request
export const testApiKey = async (apiKey: string, model: string): Promise<{ valid: boolean; error?: string }> => {
  try {
    // Create a simple test client
    const anthropic = new Anthropic({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    })

    // Make a minimal test request
    await anthropic.messages.create({
      model,
      max_tokens: 10,
      messages: [
        {
          role: 'user',
          content: 'Test'
        }
      ]
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
        valid: true // API key is valid, just rate limited
      }
    }

    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Failed to validate API key' 
    }
  }
}