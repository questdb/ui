import { describe, expect, it } from "vitest"
import { toNativeMessages } from "./openaiProvider"
import type { Message, ToolCall } from "./types"

const toolCall = (over: Partial<ToolCall> = {}): ToolCall => ({
  id: "call_1",
  name: "run_query",
  arguments: '{"sql":"SELECT 1"}',
  timestamp: 0,
  ...over,
})

describe("openaiProvider.toNativeMessages (Responses API)", () => {
  it("converts a plain user message to a user input item", () => {
    // Given a single user message
    const messages: Message[] = [{ role: "user", content: "hello" }]
    // When converted to the Responses input shape
    const native = toNativeMessages(messages)
    // Then it becomes one user item with the raw string content
    expect(native).toEqual([{ role: "user", content: "hello" }])
  })

  it("converts assistant text into a message item and tool calls into function_call items", () => {
    // Given an assistant message with text and one tool call
    const messages: Message[] = [
      {
        role: "assistant",
        content: "running it",
        tool_calls: [toolCall()],
      },
    ]
    // When converted
    const native = toNativeMessages(messages)
    // Then text becomes an output_text message and the call a function_call
    expect(native).toEqual([
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "running it" }],
      },
      {
        type: "function_call",
        call_id: "call_1",
        name: "run_query",
        arguments: '{"sql":"SELECT 1"}',
      },
    ])
  })

  it("converts a tool message into a function_call_output item", () => {
    // Given a tool result message
    const messages: Message[] = [
      { role: "tool", content: "1 row", tool_call_id: "call_1" },
    ]
    // When converted
    const native = toNativeMessages(messages)
    // Then it becomes a function_call_output keyed by call_id
    expect(native).toEqual([
      { type: "function_call_output", call_id: "call_1", output: "1 row" },
    ])
  })

  it("defers a user message that appears right after a function_call until after the tool output", () => {
    // Given a user message wedged between a function_call and its output
    const messages: Message[] = [
      { role: "assistant", content: null, tool_calls: [toolCall()] },
      { role: "user", content: "wait, also chart it" },
      { role: "tool", content: "1 row", tool_call_id: "call_1" },
    ]
    // When converted
    const native = toNativeMessages(messages)
    // Then the function_call_output stays adjacent to its call and the user
    // item is flushed afterwards
    expect(native).toEqual([
      {
        type: "function_call",
        call_id: "call_1",
        name: "run_query",
        arguments: '{"sql":"SELECT 1"}',
      },
      { type: "function_call_output", call_id: "call_1", output: "1 row" },
      { role: "user", content: "wait, also chart it" },
    ])
  })

  it("flushes a trailing deferred user item at the end of conversion", () => {
    // Given a function_call followed only by a deferred user message
    const messages: Message[] = [
      { role: "assistant", content: null, tool_calls: [toolCall()] },
      { role: "user", content: "trailing" },
    ]
    // When converted
    const native = toNativeMessages(messages)
    // Then the deferred user item is appended after the function_call
    expect(native).toEqual([
      {
        type: "function_call",
        call_id: "call_1",
        name: "run_query",
        arguments: '{"sql":"SELECT 1"}',
      },
      { role: "user", content: "trailing" },
    ])
  })

  it("emits call_id: undefined for a tool message missing tool_call_id (current behavior)", () => {
    // Given a tool message with no tool_call_id
    const messages: Message[] = [{ role: "tool", content: "orphan" }]
    // When converted
    const native = toNativeMessages(messages)
    // Then the function_call_output carries an undefined call_id (locked-in)
    expect(native).toEqual([
      { type: "function_call_output", call_id: undefined, output: "orphan" },
    ])
  })
})
