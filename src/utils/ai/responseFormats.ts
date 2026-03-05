import type { ResponseFormatSchema } from "./types"

export const ExplainFormat: ResponseFormatSchema = {
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
}

export const FixSQLFormat: ResponseFormatSchema = {
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
}

export const ConversationResponseFormat: ResponseFormatSchema = {
  name: "conversation_response_format",
  schema: {
    type: "object",
    properties: {
      sql: { type: ["string", "null"] },
      explanation: { type: "string" },
    },
    required: ["sql", "explanation"],
    additionalProperties: false,
  },
  strict: true,
}

export const ChatTitleFormat: ResponseFormatSchema = {
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
}
