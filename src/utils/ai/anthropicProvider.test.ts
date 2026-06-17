import { describe, expect, it } from "vitest"
import { toNativeMessages } from "./anthropicProvider"
import type { Message, ToolCall } from "./types"

const toolCall = (over: Partial<ToolCall> = {}): ToolCall => ({
  id: "call_1",
  name: "run_query",
  arguments: '{"sql":"SELECT 1"}',
  timestamp: 0,
  ...over,
})

describe("anthropicProvider.toNativeMessages", () => {
  it("converts a plain user message to a user role param", () => {
    // Given a single user message
    const messages: Message[] = [{ role: "user", content: "hello" }]
    // When converted to native shape
    const native = toNativeMessages(messages)
    // Then it becomes one user param with the raw string content
    expect(native).toEqual([{ role: "user", content: "hello" }])
  })

  it("converts an assistant message with text and tool calls to text + tool_use blocks", () => {
    // Given an assistant message carrying text and one tool call
    const messages: Message[] = [
      {
        role: "assistant",
        content: "running it",
        tool_calls: [toolCall()],
      },
    ]
    // When converted
    const native = toNativeMessages(messages)
    // Then it becomes a single assistant param with text then tool_use
    expect(native).toEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "running it" },
          {
            type: "tool_use",
            id: "call_1",
            name: "run_query",
            input: { sql: "SELECT 1" },
          },
        ],
      },
    ])
  })

  it("converts a tool-result message into a user tool_result block", () => {
    // Given an assistant tool call followed by its tool result
    const messages: Message[] = [
      { role: "assistant", content: null, tool_calls: [toolCall()] },
      { role: "tool", content: "1 row", tool_call_id: "call_1" },
    ]
    // When converted
    const native = toNativeMessages(messages)
    // Then the result becomes a user message holding a tool_result block
    expect(native).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "run_query",
            input: { sql: "SELECT 1" },
          },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "call_1", content: "1 row" },
        ],
      },
    ])
  })

  it("merges a user message that lands between tool calls into the tool_result user message", () => {
    // Given a tool result and an interleaved user message before the next turn
    const messages: Message[] = [
      { role: "assistant", content: null, tool_calls: [toolCall()] },
      { role: "tool", content: "1 row", tool_call_id: "call_1" },
      { role: "user", content: "now chart it" },
    ]
    // When converted
    const native = toNativeMessages(messages)
    // Then both land in one user param with the tool_result ordered first
    expect(native).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "run_query",
            input: { sql: "SELECT 1" },
          },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "call_1", content: "1 row" },
          { type: "text", text: "now chart it" },
        ],
      },
    ])
  })

  it("orders tool_result blocks before text when merging multiple user blocks", () => {
    // Given a text user message followed by a tool result in the same user param
    const messages: Message[] = [
      { role: "user", content: "first text" },
      { role: "tool", content: "result", tool_call_id: "call_1" },
    ]
    // When converted
    const native = toNativeMessages(messages)
    // Then the merged user content puts the tool_result ahead of the text
    expect(native).toEqual([
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "call_1", content: "result" },
          { type: "text", text: "first text" },
        ],
      },
    ])
  })

  it("emits tool_use_id: undefined for a tool message missing tool_call_id (current behavior)", () => {
    // Given a tool message with no tool_call_id
    const messages: Message[] = [{ role: "tool", content: "orphan" }]
    // When converted
    const native = toNativeMessages(messages)
    // Then the tool_result carries an undefined tool_use_id (locked-in behavior)
    expect(native).toEqual([
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: undefined, content: "orphan" },
        ],
      },
    ])
  })
})
