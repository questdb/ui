import { describe, expect, it } from "vitest"
import { captureChatDispatch } from "./chatDispatch"
import type { ConversationMessage } from "./types"

describe("captureChatDispatch", () => {
  const owner = Symbol()
  const messages: ConversationMessage[] = []

  it("keeps the flow while the same owner holds the same transcript", () => {
    // Given
    const ownsChat = captureChatDispatch(() => ({ owner, messages }), "c1")

    // Then
    expect(ownsChat()).toBe(true)
  })

  it.each([
    ["another owner takes the chat", { owner: Symbol(), messages }],
    ["the transcript changes", { owner, messages: [...messages] }],
    ["the chat is no longer active", null],
  ])("drops the flow when %s", (_, later) => {
    // Given
    let state: ReturnType<Parameters<typeof captureChatDispatch>[0]> = {
      owner,
      messages,
    }
    const ownsChat = captureChatDispatch(() => state, "c1")

    // When
    state = later

    // Then
    expect(ownsChat()).toBe(false)
  })

  it("never owns a chat that was not active when the flow started", () => {
    expect(captureChatDispatch(() => null, "c1")()).toBe(false)
  })
})
