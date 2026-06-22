import { describe, expect, it } from "vitest"
import { toNativeMessages } from "./openaiChatCompletionsProvider"
import type { Message, ToolCall } from "./types"

const toolCall = (over: Partial<ToolCall> = {}): ToolCall => ({
  id: "call_1",
  name: "run_query",
  arguments: '{"sql":"SELECT 1"}',
  timestamp: 0,
  ...over,
})

describe("openaiChatCompletionsProvider.toNativeMessages", () => {
  it("converts a plain user message to a user role message", () => {
    // Given a single user message
    const messages: Message[] = [{ role: "user", content: "hello" }]
    // When converted to Chat Completions shape
    const native = toNativeMessages(messages)
    // Then it becomes one user message with the raw string content
    expect(native).toEqual([{ role: "user", content: "hello" }])
  })

  it("converts an assistant message with tool calls to assistant + tool_calls", () => {
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
    // Then it becomes an assistant message carrying a function tool_call
    expect(native).toEqual([
      {
        role: "assistant",
        content: "running it",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "run_query", arguments: '{"sql":"SELECT 1"}' },
          },
        ],
      },
    ])
  })

  it("nulls assistant content when only tool calls are present", () => {
    // Given an assistant message with no text but a tool call
    const messages: Message[] = [
      { role: "assistant", content: null, tool_calls: [toolCall()] },
    ]
    // When converted
    const native = toNativeMessages(messages)
    // Then content is null and the tool_calls are present
    expect(native).toEqual([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "run_query", arguments: '{"sql":"SELECT 1"}' },
          },
        ],
      },
    ])
  })

  it("converts a tool message into a tool role message", () => {
    // Given a tool result message
    const messages: Message[] = [
      { role: "tool", content: "1 row", tool_call_id: "call_1" },
    ]
    // When converted
    const native = toNativeMessages(messages)
    // Then it becomes a tool message keyed by tool_call_id
    expect(native).toEqual([
      { role: "tool", tool_call_id: "call_1", content: "1 row" },
    ])
  })

  it("defers a user message wedged between assistant(tool_calls) and the tool result", () => {
    // Given a user message between an assistant tool call and its result
    const messages: Message[] = [
      { role: "assistant", content: null, tool_calls: [toolCall()] },
      { role: "user", content: "wait, also chart it" },
      { role: "tool", content: "1 row", tool_call_id: "call_1" },
    ]
    // When converted
    const native = toNativeMessages(messages)
    // Then the tool message stays adjacent to its assistant call and the user
    // message is flushed afterwards
    expect(native).toEqual([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "run_query", arguments: '{"sql":"SELECT 1"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "1 row" },
      { role: "user", content: "wait, also chart it" },
    ])
  })

  it("flushes a trailing deferred user message at the end of conversion", () => {
    // Given an assistant tool call followed only by a deferred user message
    const messages: Message[] = [
      { role: "assistant", content: null, tool_calls: [toolCall()] },
      { role: "user", content: "trailing" },
    ]
    // When converted
    const native = toNativeMessages(messages)
    // Then the deferred user message is appended after the assistant message
    expect(native).toEqual([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "run_query", arguments: '{"sql":"SELECT 1"}' },
          },
        ],
      },
      { role: "user", content: "trailing" },
    ])
  })

  it("emits tool_call_id: undefined for a tool message missing tool_call_id (current behavior)", () => {
    // Given a tool message with no tool_call_id
    const messages: Message[] = [{ role: "tool", content: "orphan" }]
    // When converted
    const native = toNativeMessages(messages)
    // Then the tool message carries an undefined tool_call_id (locked-in)
    expect(native).toEqual([
      { role: "tool", tool_call_id: undefined, content: "orphan" },
    ])
  })
})
