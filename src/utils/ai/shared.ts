import type { ResponseFormatSchema } from "./types"
import { jsonrepair } from "jsonrepair"

export class RefusalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RefusalError"
  }
}

export class MaxTokensError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MaxTokensError"
  }
}

export class StreamingError extends Error {
  constructor(
    message: string,
    public readonly errorType: "failed" | "network" | "interrupted" | "unknown",
    public readonly originalError?: unknown,
  ) {
    super(message)
    this.name = "StreamingError"
  }
}

export const safeJsonParse = <T>(text: string): T | object => {
  try {
    return JSON.parse(text) as T
  } catch {
    try {
      return JSON.parse(jsonrepair(text)) as T
    } catch {
      return {}
    }
  }
}

export function extractPartialExplanation(partialJson: string): string {
  const explanationMatch = partialJson.match(
    /"explanation"\s*:\s*"((?:[^"\\]|\\.)*)/,
  )
  if (!explanationMatch) {
    return ""
  }

  return explanationMatch[1]
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
}

export function extractJsonWithExpectedFields(
  text: string,
  expectedFields: string[],
): Record<string, unknown> | null {
  let searchStart = 0
  while (true) {
    const braceStart = text.indexOf("{", searchStart)
    if (braceStart === -1) break

    const textFromBrace = text.slice(braceStart)
    let endIdx = textFromBrace.lastIndexOf("}")
    while (endIdx > 0) {
      const candidate = textFromBrace.slice(0, endIdx + 1)
      // Try direct JSON.parse first, then jsonrepair as fallback
      let parsed: Record<string, unknown> | null = null
      try {
        parsed = JSON.parse(candidate) as Record<string, unknown>
      } catch {
        try {
          parsed = JSON.parse(jsonrepair(candidate)) as Record<string, unknown>
        } catch {
          // jsonrepair couldn't fix it either
        }
      }

      if (parsed !== null) {
        if (expectedFields.every((field) => field in parsed)) {
          const result: Record<string, unknown> = {}
          for (const field of expectedFields) {
            result[field] = parsed[field]
          }
          return result
        }
        break // Valid JSON but missing expected fields — try next {
      }
      endIdx = textFromBrace.lastIndexOf("}", endIdx - 1)
    }
    searchStart = braceStart + 1
  }
  return null
}

export function parseCustomProviderResponse<T>(
  text: string,
  expectedFields: string[],
  fallback: (rawText: string) => T,
): T {
  try {
    return JSON.parse(text) as T
  } catch {
    // not valid JSON as-is
  }

  const extracted = extractJsonWithExpectedFields(text, expectedFields)
  if (extracted) {
    return extracted as T
  }

  try {
    const repaired = JSON.parse(jsonrepair(text)) as Record<string, unknown>
    if (
      repaired !== null &&
      typeof repaired === "object" &&
      !Array.isArray(repaired) &&
      (expectedFields.length === 0 ||
        expectedFields.every((field) => field in repaired))
    ) {
      return repaired as T
    }
  } catch {
    // jsonrepair couldn't salvage it
  }

  // Fallback — caller decides the shape
  return fallback(text)
}

export function responseFormatToPromptInstruction(
  format: ResponseFormatSchema,
): string {
  const properties = format.schema.properties as Record<
    string,
    { type: unknown }
  >
  const required = (format.schema.required as string[]) || []

  const fields = Object.entries(properties)
    .map(([key, value]) => {
      const typeStr = Array.isArray(value.type)
        ? value.type.join(" | ")
        : String(value.type)
      const isRequired = required.includes(key)
      return `  "${key}": ${typeStr}${isRequired ? " (required)" : " (optional)"}`
    })
    .join(",\n")

  return `\nAlways respond with a valid JSON object with the following fields:\n{\n${fields}\n}`
}
