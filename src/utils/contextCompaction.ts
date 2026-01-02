import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import type { ConversationMessage } from "../providers/AIConversationProvider/types"
import {
  countTokens,
  COMPACTION_THRESHOLDS,
  type ConversationMessage as TokenConversationMessage,
} from "./tokenCounting"
import {
  type Provider,
  MODEL_OPTIONS,
  getModelProps,
} from "./aiAssistantSettings"

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

function toTokenMessages(
  messages: [...ConversationMessage[], Omit<ConversationMessage, "id">],
): TokenConversationMessage[] {
  return messages
    .filter((m) => m.content && m.content.trim() !== "")
    .map((m) => ({
      role: m.role,
      content: m.content,
    }))
}

async function generateSummary(
  middleMessages: ConversationMessage[],
  provider: Provider,
  anthropicClient?: Anthropic,
  openaiClient?: OpenAI,
): Promise<string> {
  const testModel = MODEL_OPTIONS.find(
    (m) => m.provider === provider && m.isTestModel,
  )
  if (!testModel) {
    throw new Error("No test model found for provider")
  }

  const conversationText = middleMessages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n")

  const userMessage = `Please summarize the following conversation:\n\n${conversationText}`

  if (provider === "anthropic" && anthropicClient) {
    const response = await anthropicClient.messages.create({
      ...getModelProps(testModel.value),
      max_tokens: 8192,
      messages: [{ role: "user", content: userMessage }],
      system: SUMMARIZATION_PROMPT,
    })

    const textBlock = response.content.find((block) => block.type === "text")
    return textBlock?.type === "text" ? textBlock.text : ""
  } else if (provider === "openai" && openaiClient) {
    const response = await openaiClient.responses.create({
      ...getModelProps(testModel.value),
      instructions: SUMMARIZATION_PROMPT,
      input: userMessage,
    })

    return response.output_text || ""
  }

  throw new Error("No valid client provided for summarization")
}

export async function compactConversationIfNeeded(
  conversationHistory: ConversationMessage[],
  provider: Provider,
  systemPrompt: string,
  userMessage: string,
  setStatusCompacting: () => void,
  options: {
    anthropicClient?: Anthropic
    openaiClient?: OpenAI
    model?: string
  } = {},
): Promise<CompactionResult> {
  const messages = [
    ...conversationHistory,
    {
      role: "user" as const,
      content: userMessage,
      timestamp: Date.now(),
    } as Omit<ConversationMessage, "id">,
  ] as [...ConversationMessage[], Omit<ConversationMessage, "id">]
  const totalChars =
    systemPrompt.length + messages.reduce((sum, m) => sum + m.content.length, 0)
  if (totalChars < COMPACTION_THRESHOLDS[provider]) {
    return { wasCompacted: false }
  }

  const tokenMessages = toTokenMessages(messages)
  const estimatedTokens = await countTokens(
    provider,
    tokenMessages,
    systemPrompt,
    {
      anthropicClient: options.anthropicClient,
      model: options.model,
    },
  )

  if (estimatedTokens === -1) {
    console.error(
      "Failed to estimate tokens for conversation, using full messages list.",
    )
    return {
      wasCompacted: false,
    }
  }

  if (estimatedTokens <= COMPACTION_THRESHOLDS[provider]) {
    return { wasCompacted: false }
  }

  if (messages.length < 3) {
    return {
      wasCompacted: false,
      error:
        "Messages in this conversation are too long to fit the context limit. Please try using shorter messages in a new chat.",
    }
  }

  const result = await compactConversationInternal(
    conversationHistory,
    provider,
    setStatusCompacting,
    options,
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
  provider: Provider,
  setStatusCompacting: () => void,
  options: {
    anthropicClient?: Anthropic
    openaiClient?: OpenAI
    model?: string
  } = {},
): Promise<CompactionResult> {
  if (messages.length === 0) {
    return { wasCompacted: false }
  }

  setStatusCompacting()

  try {
    const summary = await generateSummary(
      messages,
      provider,
      options.anthropicClient,
      options.openaiClient,
    )

    return {
      compactedMessage: buildContinuationPrompt(summary),
      wasCompacted: true,
    }
  } catch (error) {
    console.error("Failed to compact conversation:", error)
    return {
      wasCompacted: false,
      error: "Failed to generate summary for compaction.",
    }
  }
}
