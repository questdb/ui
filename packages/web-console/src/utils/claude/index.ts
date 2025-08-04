/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Copyright (c) 2014-2019 Appsicle
 *  Copyright (c) 2019-2022 QuestDB
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 ******************************************************************************/

import Anthropic from '@anthropic-ai/sdk'
import { Client } from '../questdb/client'
import { Type } from '../questdb/types'

export interface ClaudeAPIError {
  type: 'rate_limit' | 'invalid_key' | 'network' | 'unknown'
  message: string
  details?: any
}

export interface ClaudeExplanation {
  explanation: string
  error?: ClaudeAPIError
}

export interface GeneratedSQL {
  sql: string
  explanation?: string
  error?: ClaudeAPIError
}

export interface SchemaToolsClient {
  getTables: () => Promise<Array<{ name: string; type: 'table' | 'matview' }>>
  getTableSchema: (tableName: string) => Promise<string | null>
}

const CLAUDE_MODEL = 'claude-sonnet-4-20250514'
const MAX_RETRIES = 2
const RETRY_DELAY = 1000

// Rate limiting
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 2000 // 2 seconds between requests

// Tool definitions for Claude API
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

// Enhanced functions with tool calling support
export const explainQueryWithSchema = async (
  query: string,
  apiKey: string,
  schemaClient: SchemaToolsClient
): Promise<ClaudeExplanation> => {
  if (!apiKey || !query) {
    return {
      explanation: '',
      error: {
        type: 'invalid_key',
        message: 'API key or query is missing'
      }
    }
  }

  // Client-side rate limiting
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
  }
  lastRequestTime = Date.now()

  const systemPrompt = `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database. When given a QuestDB SQL query, explain what it does in clear, concise plain English.

Focus on the business logic and what the query achieves, not the SQL syntax itself. Pay special attention to QuestDB-specific features such as:
- Time-series operations (SAMPLE BY, LATEST ON, designated timestamp columns)
- Time-based filtering and aggregations
- Real-time data ingestion patterns
- Performance optimizations specific to time-series data

You have access to tools that can help you understand the database schema:
- get_tables: Get a list of all tables and materialized views
- get_table_schema: Get the full DDL schema for a specific table

Use these tools when the query references tables and it would be helpful to understand their structure for providing a better explanation.

Keep explanations brief (2-4 sentences) unless the query is particularly complex.
Use simple language that non-technical users can understand, explaining time-series concepts in business terms when relevant.`

  let retries = 0
  while (retries <= MAX_RETRIES) {
    try {
      const anthropic = new Anthropic({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true
      })

      const initialMessages = [
        {
          role: 'user' as const,
          content: `Explain this SQL query:\n\n${query}`
        }
      ]

      const message = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1000,
        system: systemPrompt,
        tools: SCHEMA_TOOLS,
        messages: initialMessages,
        temperature: 0.3
      })

      // Handle tool calls
      const response = await handleToolCalls(message, anthropic, schemaClient, initialMessages)
      
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

    } catch (error) {
      retries++
      
      if (retries > MAX_RETRIES) {
        return handleClaudeError(error)
      }

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries))
    }
  }

  return {
    explanation: '',
    error: {
      type: 'unknown',
      message: 'Failed to get explanation after retries'
    }
  }
}

export const explainErrorWithSchema = async (
  query: string,
  errorMessage: string,
  apiKey: string,
  schemaClient: SchemaToolsClient
): Promise<ClaudeExplanation> => {
  if (!apiKey || !query || !errorMessage) {
    return {
      explanation: '',
      error: {
        type: 'invalid_key',
        message: 'API key, query, or error message is missing'
      }
    }
  }

  // Client-side rate limiting
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
  }
  lastRequestTime = Date.now()

  const systemPrompt = `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database. When given a QuestDB SQL query and its error message, provide a clear explanation of:

1. What caused the error in simple terms
2. How to fix the issue with specific suggestions
3. QuestDB-specific considerations if relevant

Focus on practical solutions rather than technical jargon. Consider QuestDB-specific features such as:
- Time-series operations (SAMPLE BY, LATEST ON, designated timestamp columns)
- Data ingestion and table structure requirements
- Performance considerations for time-series queries
- QuestDB-specific SQL syntax and functions

You have access to tools that can help you understand the database schema:
- get_tables: Get a list of all tables and materialized views
- get_table_schema: Get the full DDL schema for a specific table

Use these tools when the error might be related to table structure, column names, or data types.

Keep explanations concise but actionable, providing specific steps to resolve the issue.`

  let retries = 0
  while (retries <= MAX_RETRIES) {
    try {
      const anthropic = new Anthropic({
        apiKey: apiKey,
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
        model: CLAUDE_MODEL,
        max_tokens: 1000,
        system: systemPrompt,
        tools: SCHEMA_TOOLS,
        messages: initialMessages,
        temperature: 0.3
      })

      // Handle tool calls
      const response = await handleToolCalls(message, anthropic, schemaClient, initialMessages)
      
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

    } catch (error) {
      retries++
      
      if (retries > MAX_RETRIES) {
        return handleClaudeError(error)
      }

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries))
    }
  }

  return {
    explanation: '',
    error: {
      type: 'unknown',
      message: 'Failed to get error explanation after retries'
    }
  }
}

// Generate SQL from natural language description
export const generateSQLFromDescription = async (
  description: string,
  apiKey: string,
  schemaClient: SchemaToolsClient
): Promise<GeneratedSQL> => {
  if (!apiKey || !description) {
    return {
      sql: '',
      error: {
        type: 'invalid_key',
        message: 'API key or description is missing'
      }
    }
  }

  // Client-side rate limiting
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
  }
  lastRequestTime = Date.now()

  const systemPrompt = `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database. 
When given a natural language description, generate the corresponding QuestDB SQL query.

Important guidelines:
1. Generate only valid QuestDB SQL syntax
2. Use appropriate time-series functions (SAMPLE BY, LATEST ON, etc.) when relevant
3. Follow QuestDB best practices for performance
4. Use proper timestamp handling for time-series data
5. Include appropriate WHERE clauses for time filtering when mentioned
6. Use correct data types and functions specific to QuestDB

You have access to tools that can help you understand the database schema:
- get_tables: Get a list of all tables and materialized views
- get_table_schema: Get the full DDL schema for a specific table

Use these tools to ensure you generate queries with correct table and column names.

Return ONLY the SQL query without any explanation or markdown formatting.`

  let retries = 0
  while (retries <= MAX_RETRIES) {
    try {
      const anthropic = new Anthropic({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true
      })

      const initialMessages = [
        {
          role: 'user' as const,
          content: description
        }
      ]

      const message = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1000,
        system: systemPrompt,
        tools: SCHEMA_TOOLS,
        messages: initialMessages,
        temperature: 0.2 // Lower temperature for more consistent SQL generation
      })

      // Handle tool calls
      const response = await handleToolCalls(message, anthropic, schemaClient, initialMessages)
      
      // Extract the SQL query from the response
      let sql = ''
      for (const block of response.content) {
        if (block.type === 'text' && 'text' in block) {
          sql += block.text
        }
      }
      
      sql = sql.trim()
      
      // Remove any markdown code block formatting if present
      sql = sql.replace(/^```sql\s*/i, '').replace(/\s*```$/i, '')
      sql = sql.replace(/^```\s*/i, '').replace(/\s*```$/i, '')
      
      return { 
        sql,
        explanation: description 
      }

    } catch (error) {
      retries++
      
      if (retries > MAX_RETRIES) {
        return {
          sql: '',
          error: handleClaudeError(error).error
        }
      }

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries))
    }
  }

  return {
    sql: '',
    error: {
      type: 'unknown',
      message: 'Failed to generate SQL after retries'
    }
  }
}

// Helper function to handle tool calls
async function handleToolCalls(
  message: Anthropic.Messages.Message,
  anthropic: Anthropic,
  schemaClient: SchemaToolsClient,
  conversationHistory: Array<any> = []
): Promise<Anthropic.Messages.Message> {
  if (message.stop_reason !== 'tool_use') {
    return message
  }

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

  // Build the conversation history
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

  // Continue the conversation with tool results
  const followUpMessage = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1000,
    tools: SCHEMA_TOOLS,
    messages: updatedHistory,
    temperature: 0.3
  })

  // Recursively handle tool calls if the assistant wants to use more tools
  if (followUpMessage.stop_reason === 'tool_use') {
    return handleToolCalls(followUpMessage, anthropic, schemaClient, updatedHistory)
  }

  return followUpMessage
}

// Helper function to handle Claude API errors
function handleClaudeError(error: any): ClaudeExplanation {
  if (error instanceof Anthropic.AuthenticationError) {
    return {
      explanation: '',
      error: {
        type: 'invalid_key',
        message: 'Invalid API key. Please check your Claude API key in settings.',
        details: error.message
      }
    }
  }

  if (error instanceof Anthropic.RateLimitError) {
    return {
      explanation: '',
      error: {
        type: 'rate_limit',
        message: 'Rate limit exceeded. Please try again later.',
        details: error.message
      }
    }
  }

  if (error instanceof Anthropic.APIConnectionError) {
    return {
      explanation: '',
      error: {
        type: 'network',
        message: 'Network error. Please check your internet connection.',
        details: error.message
      }
    }
  }

  if (error instanceof Anthropic.APIError) {
    return {
      explanation: '',
      error: {
        type: 'unknown',
        message: `API error: ${error.message}`,
        details: error
      }
    }
  }

  return {
    explanation: '',
    error: {
      type: 'unknown',
      message: 'An unexpected error occurred. Please try again.',
      details: error
    }
  }
}

export const explainQuery = async (
  query: string, 
  apiKey: string
): Promise<ClaudeExplanation> => {
  if (!apiKey || !query) {
    return {
      explanation: '',
      error: {
        type: 'invalid_key',
        message: 'API key or query is missing'
      }
    }
  }

  // Client-side rate limiting
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
  }
  lastRequestTime = Date.now()

    const systemPrompt = `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database. When given a QuestDB SQL query, explain what it does in clear, concise plain English.

Focus on the business logic and what the query achieves, not the SQL syntax itself. Pay special attention to QuestDB-specific features such as:
- Time-series operations (SAMPLE BY, LATEST ON, designated timestamp columns)
- Time-based filtering and aggregations
- Real-time data ingestion patterns
- Performance optimizations specific to time-series data

Keep explanations brief (2-4 sentences) unless the query is particularly complex.
Use simple language that non-technical users can understand, explaining time-series concepts in business terms when relevant.`

  let retries = 0
  while (retries <= MAX_RETRIES) {
    try {
      // Create Anthropic client with dangerouslyAllowBrowser enabled
      const anthropic = new Anthropic({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true
      })

      const message = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Explain this SQL query:\n\n${query}`
          }
        ],
        temperature: 0.3 // Lower temperature for more consistent explanations
      })

      // Extract text content from the response
      const explanation = message.content
        .filter(block => block.type === 'text')
        .map(block => {
          if ('text' in block) {
            return block.text
          }
          return ''
        })
        .join('\n')
        .trim()

      return {
        explanation
      }

    } catch (error) {
      retries++
      
      if (retries > MAX_RETRIES) {
        // Handle Anthropic SDK specific errors
        if (error instanceof Anthropic.AuthenticationError) {
          return {
            explanation: '',
            error: {
              type: 'invalid_key',
              message: 'Invalid API key. Please check your Claude API key in settings.',
              details: error.message
            }
          }
        }

        if (error instanceof Anthropic.RateLimitError) {
          return {
            explanation: '',
            error: {
              type: 'rate_limit',
              message: 'Rate limit exceeded. Please try again later.',
              details: error.message
            }
          }
        }

        if (error instanceof Anthropic.APIConnectionError) {
          return {
            explanation: '',
            error: {
              type: 'network',
              message: 'Network error. Please check your internet connection.',
              details: error.message
            }
          }
        }

        // Generic API error
        if (error instanceof Anthropic.APIError) {
          return {
            explanation: '',
            error: {
              type: 'unknown',
              message: `API error: ${error.message}`,
              details: error
            }
          }
        }

        // Fallback for other errors
        return {
          explanation: '',
          error: {
            type: 'unknown',
            message: 'An unexpected error occurred. Please try again.',
            details: error
          }
        }
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries))
    }
  }

  // Should never reach here
  return {
    explanation: '',
    error: {
      type: 'unknown',
      message: 'Failed to get explanation after retries'
    }
  }
}

// Format explanation as SQL comment block with proper line wrapping
export const formatExplanationAsComment = (explanation: string): string => {
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
  
  return `/*\n * AI Explanation:\n${formattedLines.join('\n')}\n */`
}

// Validate API key format (basic check)
export const isValidApiKeyFormat = (key: string): boolean => {
  // Claude API keys typically start with 'sk-ant-api' and are around 100+ chars
  return /^sk-ant-api\d{2}-[\w-]{90,}$/i.test(key)
}

// Test API key by making a simple request
export const testApiKey = async (apiKey: string): Promise<{ valid: boolean; error?: string }> => {
  try {
    // Create a simple test client
    const anthropic = new Anthropic({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    })

    // Make a minimal test request
    await anthropic.messages.create({
      model: CLAUDE_MODEL,
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

// Explain SQL error using Claude API
export const explainError = async (
  query: string,
  errorMessage: string,
  apiKey: string
): Promise<ClaudeExplanation> => {
  if (!apiKey || !query || !errorMessage) {
    return {
      explanation: '',
      error: {
        type: 'invalid_key',
        message: 'API key, query, or error message is missing'
      }
    }
  }

  // Client-side rate limiting
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
  }
  lastRequestTime = Date.now()

  const systemPrompt = `You are a SQL expert assistant specializing in QuestDB, a high-performance time-series database. When given a QuestDB SQL query and its error message, provide a clear explanation of:

1. What caused the error in simple terms
2. How to fix the issue with specific suggestions
3. QuestDB-specific considerations if relevant

Focus on practical solutions rather than technical jargon. Consider QuestDB-specific features such as:
- Time-series operations (SAMPLE BY, LATEST ON, designated timestamp columns)
- Data ingestion and table structure requirements
- Performance considerations for time-series queries
- QuestDB-specific SQL syntax and functions

Keep explanations concise but actionable, providing specific steps to resolve the issue.`

  let retries = 0
  while (retries <= MAX_RETRIES) {
    try {
      // Create Anthropic client with dangerouslyAllowBrowser enabled
      const anthropic = new Anthropic({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true
      })

      const message = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 600, // Slightly more tokens for error explanations
        system: systemPrompt,
        messages: [
          {
            role: 'user',
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
        ],
        temperature: 0.3
      })

      // Extract text content from the response
      const explanation = message.content
        .filter(block => block.type === 'text')
        .map(block => {
          if ('text' in block) {
            return block.text
          }
          return ''
        })
        .join('\n')
        .trim()

      return {
        explanation
      }

    } catch (error) {
      retries++
      
      if (retries > MAX_RETRIES) {
        // Handle Anthropic SDK specific errors
        if (error instanceof Anthropic.AuthenticationError) {
          return {
            explanation: '',
            error: {
              type: 'invalid_key',
              message: 'Invalid API key. Please check your Claude API key in settings.',
              details: error.message
            }
          }
        }

        if (error instanceof Anthropic.RateLimitError) {
          return {
            explanation: '',
            error: {
              type: 'rate_limit',
              message: 'Rate limit exceeded. Please try again later.',
              details: error.message
            }
          }
        }

        if (error instanceof Anthropic.APIConnectionError) {
          return {
            explanation: '',
            error: {
              type: 'network',
              message: 'Network error. Please check your internet connection.',
              details: error.message
            }
          }
        }

        // Generic API error
        if (error instanceof Anthropic.APIError) {
          return {
            explanation: '',
            error: {
              type: 'unknown',
              message: `API error: ${error.message}`,
              details: error
            }
          }
        }

        // Fallback for other errors
        return {
          explanation: '',
          error: {
            type: 'unknown',
            message: 'An unexpected error occurred. Please try again.',
            details: error
          }
        }
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries))
    }
  }

  // Should never reach here
  return {
    explanation: '',
    error: {
      type: 'unknown',
      message: 'Failed to get error explanation after retries'
    }
  }
}

// Schema client implementation that wraps QuestDB client
export function createSchemaClient(questClient: Client): SchemaToolsClient {
  return {
    async getTables(): Promise<Array<{ name: string; type: 'table' | 'matview' }>> {
      try {
        const [tablesResponse, matViewsResponse] = await Promise.all([
          questClient.showTables(),
          questClient.query<{ view_name: string }>('materialized_views()')
        ])

        const tables: Array<{ name: string; type: 'table' | 'matview' }> = []

        // Add regular tables
        if (tablesResponse?.type === Type.DQL && tablesResponse.data) {
          const matViewNames = new Set(
            matViewsResponse?.type === Type.DQL && matViewsResponse.data
              ? matViewsResponse.data.map((mv: any) => mv.view_name)
              : []
          )

          // Filter out materialized views from tables list
          const regularTables = tablesResponse.data.filter(
            table => !matViewNames.has(table.table_name)
          )

          tables.push(
            ...regularTables.map(table => ({
              name: table.table_name,
              type: 'table' as const
            }))
          )
        }

        // Add materialized views
        if (matViewsResponse?.type === Type.DQL && matViewsResponse.data) {
          tables.push(
            ...matViewsResponse.data.map(mv => ({
              name: mv.view_name,
              type: 'matview' as const
            }))
          )
        }

        return tables.sort((a, b) => a.name.localeCompare(b.name))
      } catch (error) {
        console.error('Failed to fetch tables:', error)
        return []
      }
    },

    async getTableSchema(tableName: string): Promise<string | null> {
      try {
        // First check if it's a materialized view
        const matViewsResponse = await questClient.query<{ view_name: string }>(
          'materialized_views()'
        )
        
        const isMatView = matViewsResponse?.type === Type.DQL && 
          matViewsResponse.data?.some((mv: any) => mv.view_name === tableName)

        // Get the appropriate DDL
        const ddlResponse = isMatView
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
