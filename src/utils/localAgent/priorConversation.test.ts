import { describe, expect, it } from "vitest"
import type { ConversationMessage } from "../../providers/AIConversationProvider/types"
import { priorConversationFor, titleFromMessage } from "./priorConversation"

const message = (
  overrides: Partial<ConversationMessage> & Pick<ConversationMessage, "role">,
): ConversationMessage => ({
  id: crypto.randomUUID(),
  timestamp: 0,
  content: "",
  ...overrides,
})

describe("priorConversationFor", () => {
  it("hands the agent what the user saw of an earlier model's turns", () => {
    // Given
    const history = [
      message({
        role: "user",
        content: "<workspace>…</workspace>\nShow trades",
        displayUserMessage: "Show trades",
      }),
      message({ role: "assistant", content: "Here is the query." }),
      message({ role: "tool", content: "{}", hideFromUI: true }),
    ]

    // When
    const prior = priorConversationFor(history, "claude")

    // Then
    expect(prior).toBe(
      [
        "<earlier_conversation>",
        "The user talked to another assistant in this chat before switching to you. Earlier messages, oldest first:",
        "User: Show trades",
        "Assistant: Here is the query.",
        "</earlier_conversation>",
      ].join("\n"),
    )
  })

  it("sends nothing once the same agent has answered in this chat", () => {
    // Given
    const history = [
      message({ role: "user", content: "Show trades" }),
      message({ role: "assistant", content: "Done.", localAgentId: "claude" }),
    ]

    // When / Then
    expect(priorConversationFor(history, "claude")).toBeNull()
  })
})

it("sends only the turns after the agent's last answer when the chat switched away and back", () => {
  // Given
  const history = [
    message({ role: "user", content: "Show trades" }),
    message({ role: "assistant", content: "Done.", localAgentId: "claude" }),
    message({ role: "user", content: "Now chart it" }),
    message({ role: "assistant", content: "Here is a chart query." }),
  ]

  // When
  const prior = priorConversationFor(history, "claude")

  // Then
  expect(prior).toContain(
    "User: Now chart it\nAssistant: Here is a chart query.",
  )
  expect(prior).not.toContain("Show trades")
})

describe("titleFromMessage", () => {
  it("keeps short messages and cuts long ones at a word", () => {
    expect(titleFromMessage("  Chart   trades\nby hour ")).toBe(
      "Chart trades by hour",
    )
    expect(
      titleFromMessage(
        "Create a notebook that compares the hourly volume of BTC and ETH trades",
      ),
    ).toBe("Create a notebook that compares the hourly…")
  })
})
