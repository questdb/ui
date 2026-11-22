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
  it("carries the active compaction summary alongside the recent transcript", () => {
    const history = [
      message({
        role: "user",
        content: "old verbatim turn",
        isCompacted: true,
      }),
      message({
        role: "user",
        content:
          "## PREVIOUS CONVERSATION SUMMARY:\n\nUse UTC for daily totals.\n\n\n**Continue helping the user from where we left off.**",
        hideFromUI: true,
      }),
      ...Array.from({ length: 20 }, () =>
        message({ role: "user", content: "Recent question" }),
      ),
    ]
    const prior = priorConversationFor(history, "claude")
    expect(prior).toContain("Summary of older turns: Use UTC for daily totals.")
    expect(prior).toContain("User: Recent question")
    expect(prior).not.toContain("old verbatim turn")
  })

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

  it("caps the handoff at 20 visible entries, not 20 stored rows", () => {
    const history = [
      message({ role: "user", content: "Older visible turn" }),
      message({ role: "user", content: "Use UTC for dates." }),
      ...Array.from({ length: 18 }, (_, index) =>
        message({ role: "assistant", content: `Visible reply ${index}` }),
      ),
      ...Array.from({ length: 10 }, () => [
        message({ role: "tool", content: "{}", hideFromUI: true }),
        message({ role: "assistant", content: null }),
      ]).flat(),
      message({ role: "assistant", content: "Final reply" }),
    ]

    const prior = priorConversationFor(history, "claude")

    expect(prior?.split("\n").slice(2, -1)).toEqual([
      "User: Use UTC for dates.",
      ...Array.from(
        { length: 18 },
        (_, index) => `Assistant: Visible reply ${index}`,
      ),
      "Assistant: Final reply",
    ])
  })

  it("keeps the summary, per-message, and total content budgets", () => {
    const history = [
      message({
        role: "user",
        hideFromUI: true,
        content: `## PREVIOUS CONVERSATION SUMMARY:\n\n${"s".repeat(6_001)}\n\n\n**Continue helping the user from where we left off.**`,
      }),
      message({ role: "user", content: "x".repeat(2_001) }),
      message({ role: "user", content: "y".repeat(2_001) }),
      message({ role: "user", content: "z".repeat(2_001) }),
    ]

    const prior = priorConversationFor(history, "claude")

    expect(prior?.split("\n").slice(2, -1)).toEqual([
      `Summary of older turns: ${"s".repeat(6_000)}…`,
      `User: ${"y".repeat(2_000)}…`,
      `User: ${"z".repeat(2_000)}…`,
    ])
  })

  it("includes the SQL shown as a suggestion even when it is not in the assistant's text", () => {
    // Given
    const history = [
      message({ role: "user", content: "Show trades" }),
      message({
        role: "assistant",
        content: "This query filters by symbol.",
        sql: "select * from trades where symbol = 'BTC'",
      }),
    ]

    // When
    const prior = priorConversationFor(history, "claude")

    // Then
    expect(prior).toContain("Assistant: This query filters by symbol.")
    expect(prior).toContain("select * from trades where symbol = 'BTC'")
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
