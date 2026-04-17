import type { ConversationMessage } from "../providers/AIConversationProvider/types"
import { getTestModel } from "./ai"
import type { AIProvider, Message } from "./ai"
import { getMessageTextLength } from "./ai/shared"
import type { AiAssistantSettings } from "../providers/LocalStorageProvider/types"

type CompactionResultSuccess = {
  compactedMessage: string
  wasCompacted: true
}

type CompactionResultTerminationError = {
  wasCompacted: false
  error: string
}

type CompactionResultContinuationError = {
  wasCompacted: false
}

export type CompactionResult =
  | CompactionResultSuccess
  | CompactionResultTerminationError
  | CompactionResultContinuationError

const SUMMARIZATION_PROMPT = `Summarize this SQL assistant conversation in a structured format.
Be extremely concise - use bullet points, not paragraphs.

Required sections:
1. INITIAL REQUEST OF THE USER: What the user initially asked for (1-2 lines max)
2. CURRENT SQL: The final SQL query/queries produced (include actual SQL code) if any
3. KEY DECISIONS: Important choices made during the conversation (bullet points)
4. CURRENT STATE: Where we left off - what was the last thing discussed

Format your response as:
---
## INITIAL REQUEST OF THE USER: [brief description]


## CURRENT SQL:
\`\`\`sql
[final SQL here, or "None yet" if no SQL was generated]
\`\`\`


## KEY DECISIONS:
- [decision 1]
- [decision 2]


## CURRENT STATE:
[what user was working on last]
---

Keep total summary under 1000 words. Focus on SQL code (if any generated) and outcomes, not process details.`

export function buildContinuationPrompt(summary: string): string {
  return `## PREVIOUS CONVERSATION SUMMARY:

${summary}


**Continue helping the user from where we left off.**`
}

/** Convert ConversationMessage[] to Message[] for the provider (strip metadata). */
export function toApiMessages(messages: ConversationMessage[]): Message[] {
  return messages
    .filter((m) => {
      if (m.role === "tool") return true
      if (m.role === "assistant") {
        return m.content || m.tool_calls?.length || m.reasoning?.content
      }
      return typeof m.content === "string" && m.content.trim().length > 0
    })
    .map((m): Message => {
      const msg: Message = { role: m.role, content: m.content }
      if (m.tool_calls) msg.tool_calls = m.tool_calls
      if (m.reasoning?.content) msg.reasoning = m.reasoning
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
      if (m.name) msg.name = m.name
      return msg
    })
}

async function generateSummary(
  middleMessages: ConversationMessage[],
  aiProvider: AIProvider,
  settings?: AiAssistantSettings,
  abortSignal?: AbortSignal,
): Promise<string> {
  const testModelValue = getTestModel(aiProvider.id, settings)
  if (!testModelValue) {
    throw new Error("No test model found for provider")
  }

  const conversationText = middleMessages
    .map((m) => {
      if (m.role === "user") {
        return `USER: ${m.content ?? ""}`
      }
      if (m.role === "tool") {
        return `TOOL RESULT (${m.name ?? "unknown"}): ${m.content ?? ""}`
      }
      // assistant
      const parts: string[] = []
      if (m.reasoning?.content) {
        parts.push(`THINKING: ${m.reasoning.content}`)
      }
      if (m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          parts.push(`TOOL CALL: ${tc.name}(${tc.arguments})`)
        }
      }
      if (m.content) {
        parts.push(`ASSISTANT: ${m.content}`)
      }
      return parts.join("\n")
    })
    .filter(Boolean)
    .join("\n\n")

  const userMessage = `Please summarize the following conversation:\n\n${conversationText}`

  return aiProvider.generateSummary({
    model: testModelValue,
    systemPrompt: SUMMARIZATION_PROMPT,
    userMessage,
    abortSignal,
  })
}

export async function compactConversationIfNeeded(
  conversationHistory: ConversationMessage[],
  aiProvider: AIProvider,
  systemPrompt: string,
  userMessage: string,
  setStatusCompacting: () => void,
  options: { model?: string; aiAssistantSettings?: AiAssistantSettings } = {},
  abortSignal?: AbortSignal,
): Promise<CompactionResult> {
  const compactionThreshold = aiProvider.contextWindow - 50_000
  const allMessages: ConversationMessage[] = [
    ...conversationHistory,
    {
      id: "",
      role: "user" as const,
      content: userMessage,
      timestamp: Date.now(),
    },
  ]

  const apiMessages = toApiMessages(allMessages)

  const totalChars =
    systemPrompt.length +
    apiMessages.reduce((sum, m) => sum + getMessageTextLength(m), 0)

  if (totalChars < compactionThreshold) {
    return { wasCompacted: false }
  }

  let estimatedTokens: number
  try {
    estimatedTokens = await aiProvider.countTokens({
      messages: apiMessages,
      systemPrompt,
      model: options.model ?? "",
    })
  } catch {
    console.error(
      "Failed to estimate tokens for conversation, using full messages list.",
    )
    return { wasCompacted: false }
  }

  if (estimatedTokens <= compactionThreshold) {
    return { wasCompacted: false }
  }

  if (allMessages.length < 3) {
    return {
      wasCompacted: false,
      error:
        "Messages in this conversation are too long to fit the context limit. Please try using shorter messages in a new chat.",
    }
  }

  const result = await compactConversationInternal(
    conversationHistory,
    aiProvider,
    setStatusCompacting,
    options.aiAssistantSettings,
    abortSignal,
  )

  if (!result.wasCompacted) {
    return {
      ...result,
      error:
        "Messages in this conversation are too long to fit the context limit. Please try using shorter messages in a new chat.",
    }
  }

  return result
}

async function compactConversationInternal(
  messages: ConversationMessage[],
  aiProvider: AIProvider,
  setStatusCompacting: () => void,
  settings?: AiAssistantSettings,
  abortSignal?: AbortSignal,
): Promise<CompactionResult> {
  if (messages.length === 0) {
    return { wasCompacted: false }
  }

  setStatusCompacting()

  try {
    const summary = await generateSummary(
      messages,
      aiProvider,
      settings,
      abortSignal,
    )

    return {
      compactedMessage: buildContinuationPrompt(summary),
      wasCompacted: true,
    }
  } catch (error) {
    if (abortSignal?.aborted) {
      return { wasCompacted: false }
    }
    console.error("Failed to compact conversation:", error)
    return {
      wasCompacted: false,
      error: "Failed to generate summary for compaction.",
    }
  }
}
