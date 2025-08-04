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

export interface ClaudeAPIError {
  type: 'rate_limit' | 'invalid_key' | 'network' | 'unknown'
  message: string
  details?: any
}

export interface ClaudeExplanation {
  explanation: string
  error?: ClaudeAPIError
}

const CLAUDE_MODEL = 'claude-3-5-sonnet-20241022'
const MAX_RETRIES = 2
const RETRY_DELAY = 1000

// Rate limiting
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 2000 // 2 seconds between requests

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
