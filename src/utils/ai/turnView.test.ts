import { describe, it, expect } from "vitest"
import type { ConversationMessage } from "../../providers/AIConversationProvider/types"
import { AIOperationStatus } from "../../providers/AIStatusProvider"
import type { StatusEntry } from "../../providers/AIStatusProvider"
import {
  projectConversationTurns,
  getLastTurnWithUnactionedDiff,
  getScrollLength,
  buildInterleavedTimeline,
} from "./turnView"

function msg(
  overrides: Partial<ConversationMessage> & { id: string; role: string },
): ConversationMessage {
  return {
    content: null,
    timestamp: Date.now(),
    ...overrides,
  } as ConversationMessage
}

describe("projectConversationTurns", () => {
  it("returns empty for empty messages", () => {
    const result = projectConversationTurns([])
    expect(result.turns).toHaveLength(0)
    expect(result.visibleEntries).toHaveLength(0)
    expect(result.lastAssistantAnchorIndex).toBe(-1)
  })

  it("projects a single user message", () => {
    const messages = [msg({ id: "u1", role: "user", content: "hello" })]
    const result = projectConversationTurns(messages)
    expect(result.visibleEntries).toHaveLength(1)
    expect(result.visibleEntries[0].type).toBe("user")
    expect(result.turns).toHaveLength(0)
  })

  it("projects user → assistant as one turn", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "hello" }),
      msg({ id: "a1", role: "assistant", content: "hi" }),
    ]
    const result = projectConversationTurns(messages)
    expect(result.visibleEntries).toHaveLength(2)
    expect(result.visibleEntries[0].type).toBe("user")
    expect(result.visibleEntries[1].type).toBe("assistantTurn")
    expect(result.turns).toHaveLength(1)
    expect(result.turns[0].anchorIndex).toBe(1)
    expect(result.turns[0].messages).toHaveLength(1)
    expect(result.lastAssistantAnchorIndex).toBe(1)
  })

  it("bundles tool and follow-up assistant messages into the same turn", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "help" }),
      msg({
        id: "a1",
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "tc1", name: "get_tables", arguments: "{}", timestamp: 0 },
        ],
      }),
      msg({
        id: "t1",
        role: "tool",
        tool_call_id: "tc1",
        content: "tables",
        hideFromUI: true,
      }),
      msg({ id: "a2", role: "assistant", content: "Here are the tables" }),
    ]
    const result = projectConversationTurns(messages)
    expect(result.turns).toHaveLength(1)
    expect(result.turns[0].anchorIndex).toBe(1)
    expect(result.turns[0].anchorMessage.id).toBe("a1")
    expect(result.turns[0].messages).toHaveLength(3) // a1, t1, a2
  })

  it("skips hideFromUI user messages", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "hello" }),
      msg({ id: "a1", role: "assistant", content: "hi" }),
      msg({
        id: "u2",
        role: "user",
        content: "compacted",
        hideFromUI: true,
      }),
      msg({ id: "a2", role: "assistant", content: "response" }),
    ]
    const result = projectConversationTurns(messages)
    // u2 is hidden, so a2 is bundled into the same turn as a1
    const userEntries = result.visibleEntries.filter((e) => e.type === "user")
    expect(userEntries).toHaveLength(1)
  })

  it("skips hideFromUI assistant messages from visibleEntries", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "hello" }),
      msg({ id: "a1", role: "assistant", content: "hi", hideFromUI: true }),
    ]
    const result = projectConversationTurns(messages)
    expect(result.visibleEntries).toHaveLength(1)
    expect(result.visibleEntries[0].type).toBe("user")
    expect(result.turns).toHaveLength(1) // turn exists but not visible
  })

  it("tracks previousVisibleUserByAnchorIndex", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "q1" }),
      msg({ id: "a1", role: "assistant", content: "r1" }),
      msg({ id: "u2", role: "user", content: "q2" }),
      msg({ id: "a2", role: "assistant", content: "r2" }),
    ]
    const result = projectConversationTurns(messages)
    expect(result.previousVisibleUserByAnchorIndex.get(1)?.id).toBe("u1")
    expect(result.previousVisibleUserByAnchorIndex.get(3)?.id).toBe("u2")
  })

  it("creates a new turn after a visible user message", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "q1" }),
      msg({ id: "a1", role: "assistant", content: "r1" }),
      msg({ id: "u2", role: "user", content: "q2" }),
      msg({ id: "a2", role: "assistant", content: "r2" }),
    ]
    const result = projectConversationTurns(messages)
    expect(result.turns).toHaveLength(2)
    expect(result.turns[0].anchorMessage.id).toBe("a1")
    expect(result.turns[1].anchorMessage.id).toBe("a2")
  })

  describe("lastVisibleUserIndex", () => {
    it("points at the latest visible user message when none follow an assistant tail", () => {
      const messages = [
        msg({ id: "u1", role: "user", content: "q1" }),
        msg({ id: "a1", role: "assistant", content: "r1" }),
        msg({ id: "a2", role: "assistant", content: "r2" }),
      ]
      const result = projectConversationTurns(messages)
      expect(result.lastVisibleUserIndex).toBe(0)
    })

    it("advances when another visible user message arrives", () => {
      const messages = [
        msg({ id: "u1", role: "user", content: "q1" }),
        msg({ id: "a1", role: "assistant", content: "r1" }),
        msg({ id: "u2", role: "user", content: "q2" }),
        msg({ id: "a2", role: "assistant", content: "r2" }),
      ]
      const result = projectConversationTurns(messages)
      expect(result.lastVisibleUserIndex).toBe(2)
    })

    it("ignores hidden user messages", () => {
      const messages = [
        msg({ id: "u1", role: "user", content: "q1" }),
        msg({ id: "a1", role: "assistant", content: "r1" }),
        msg({
          id: "u2",
          role: "user",
          content: "compacted",
          hideFromUI: true,
        }),
        msg({ id: "a2", role: "assistant", content: "r2" }),
      ]
      const result = projectConversationTurns(messages)
      expect(result.lastVisibleUserIndex).toBe(0)
    })

    it("is -1 for an empty conversation", () => {
      const result = projectConversationTurns([])
      expect(result.lastVisibleUserIndex).toBe(-1)
    })
  })
})

describe("getLastTurnWithUnactionedDiff", () => {
  it("returns null for empty messages", () => {
    expect(getLastTurnWithUnactionedDiff([])).toBeNull()
  })

  it("returns null when no SQL changes", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "hello" }),
      msg({ id: "a1", role: "assistant", content: "hi" }),
    ]
    expect(getLastTurnWithUnactionedDiff(messages)).toBeNull()
  })

  it("returns null when SQL change is accepted", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "fix" }),
      msg({
        id: "a1",
        role: "assistant",
        content: "fixed",
        sql: "SELECT 2",
        previousSQL: "SELECT 1",
        isAccepted: true,
      }),
    ]
    expect(getLastTurnWithUnactionedDiff(messages)).toBeNull()
  })

  it("returns null when SQL change is rejected", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "fix" }),
      msg({
        id: "a1",
        role: "assistant",
        content: "fixed",
        sql: "SELECT 2",
        previousSQL: "SELECT 1",
        isRejected: true,
      }),
    ]
    expect(getLastTurnWithUnactionedDiff(messages)).toBeNull()
  })

  it("returns null when SQL is unchanged", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "fix" }),
      msg({
        id: "a1",
        role: "assistant",
        content: "same",
        sql: "SELECT 1",
        previousSQL: "SELECT 1",
      }),
    ]
    expect(getLastTurnWithUnactionedDiff(messages)).toBeNull()
  })

  it("returns the anchor when there is an unactioned diff", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "fix" }),
      msg({
        id: "a1",
        role: "assistant",
        content: "fixed",
        sql: "SELECT 2",
        previousSQL: "SELECT 1",
      }),
    ]
    const result = getLastTurnWithUnactionedDiff(messages)
    expect(result?.id).toBe("a1")
  })

  it("returns the last unactioned diff when multiple exist", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "fix" }),
      msg({
        id: "a1",
        role: "assistant",
        content: "v1",
        sql: "SELECT 2",
        previousSQL: "SELECT 1",
      }),
      msg({ id: "u2", role: "user", content: "again" }),
      msg({
        id: "a2",
        role: "assistant",
        content: "v2",
        sql: "SELECT 3",
        previousSQL: "SELECT 2",
      }),
    ]
    const result = getLastTurnWithUnactionedDiff(messages)
    expect(result?.id).toBe("a2")
  })

  it("skips hidden assistant messages", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "fix" }),
      msg({
        id: "a1",
        role: "assistant",
        content: "fixed",
        sql: "SELECT 2",
        previousSQL: "SELECT 1",
        hideFromUI: true,
      }),
    ]
    expect(getLastTurnWithUnactionedDiff(messages)).toBeNull()
  })
})

describe("getScrollLength", () => {
  it("returns 0 for empty messages", () => {
    expect(getScrollLength(false, [])).toBe(0)
    expect(getScrollLength(true, [])).toBe(0)
  })

  it("counts visible messages when not streaming", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "hello" }),
      msg({ id: "a1", role: "assistant", content: "hi" }),
    ]
    expect(getScrollLength(false, messages)).toBe(2)
  })

  it("excludes hidden messages from count", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "hello" }),
      msg({
        id: "u2",
        role: "user",
        content: "hidden",
        hideFromUI: true,
      }),
      msg({ id: "a1", role: "assistant", content: "hi" }),
    ]
    expect(getScrollLength(false, messages)).toBe(2)
  })

  it("returns headVisibleCount when last message is hidden", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "hello" }),
      msg({
        id: "t1",
        role: "tool",
        content: "result",
        hideFromUI: true,
      }),
    ]
    expect(getScrollLength(true, messages)).toBe(1)
  })

  it("includes content length for streaming assistant message", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "hello" }),
      msg({ id: "a1", role: "assistant", content: "streaming text" }),
    ]
    // headVisibleCount = 1 (u1), + contentLength (14) + reasoning (0) + toolCalls (0)
    expect(getScrollLength(true, messages)).toBe(1 + 14)
  })

  it("includes reasoning length for streaming assistant message", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "hello" }),
      msg({
        id: "a1",
        role: "assistant",
        content: null,
        reasoning: { timestamp: 0, content: "thinking" },
      }),
    ]
    // headVisibleCount = 1, + contentLength (0) + reasoning (8) + toolCalls (0)
    expect(getScrollLength(true, messages)).toBe(1 + 8)
  })

  it("treats non-streaming last message as +1", () => {
    const messages = [
      msg({ id: "u1", role: "user", content: "hello" }),
      msg({ id: "a1", role: "assistant", content: "done" }),
    ]
    expect(getScrollLength(false, messages)).toBe(2)
  })

  it("treats streaming user message as +1 (not expanded)", () => {
    const messages = [
      msg({ id: "a1", role: "assistant", content: "hi" }),
      msg({ id: "u1", role: "user", content: "question" }),
    ]
    expect(getScrollLength(true, messages)).toBe(2)
  })
})

function statusEntry(
  type: AIOperationStatus,
  extra?: Partial<Omit<StatusEntry, "type">>,
): StatusEntry {
  return {
    type,
    timestamp: Date.now(),
    ...extra,
  }
}

describe("buildInterleavedTimeline", () => {
  it("returns empty for empty history", () => {
    expect(buildInterleavedTimeline([])).toHaveLength(0)
  })

  it("groups consecutive non-GeneratingResponse entries into one operations item", () => {
    const history = [
      statusEntry(AIOperationStatus.RetrievingTables, { timestamp: 1 }),
      statusEntry(AIOperationStatus.InvestigatingTable, { timestamp: 2 }),
    ]
    const result = buildInterleavedTimeline(history)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe("operations")
    if (result[0].type === "operations") {
      expect(result[0].operations).toHaveLength(2)
    }
  })

  it("creates a content item for GeneratingResponse with non-empty content", () => {
    const history = [
      statusEntry(AIOperationStatus.RetrievingTables, { timestamp: 1 }),
      statusEntry(AIOperationStatus.GeneratingResponse, {
        timestamp: 2,
        content: "Some explanation",
      }),
    ]
    const result = buildInterleavedTimeline(history)
    expect(result).toHaveLength(2)
    expect(result[0].type).toBe("operations")
    expect(result[1].type).toBe("content")
    if (result[1].type === "content") {
      expect(result[1].content).toBe("Some explanation")
    }
  })

  it("skips GeneratingResponse with empty or whitespace-only content", () => {
    const history = [
      statusEntry(AIOperationStatus.RetrievingTables, { timestamp: 1 }),
      statusEntry(AIOperationStatus.GeneratingResponse, {
        timestamp: 2,
        content: "   ",
      }),
    ]
    const result = buildInterleavedTimeline(history)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe("operations")
  })

  it("sets endTimestamp on the preceding operations when GeneratingResponse appears", () => {
    const history = [
      statusEntry(AIOperationStatus.RetrievingTables, { timestamp: 10 }),
      statusEntry(AIOperationStatus.GeneratingResponse, {
        timestamp: 20,
        content: "text",
      }),
    ]
    const result = buildInterleavedTimeline(history)
    expect(result[0].type).toBe("operations")
    if (result[0].type === "operations") {
      expect(result[0].endTimestamp).toBe(20)
    }
  })

  it("handles interleaved operations and content", () => {
    const history = [
      statusEntry(AIOperationStatus.RetrievingTables, { timestamp: 1 }),
      statusEntry(AIOperationStatus.GeneratingResponse, {
        timestamp: 2,
        content: "First text",
      }),
      statusEntry(AIOperationStatus.ValidatingQuery, { timestamp: 3 }),
      statusEntry(AIOperationStatus.GeneratingResponse, {
        timestamp: 4,
        content: "Second text",
      }),
    ]
    const result = buildInterleavedTimeline(history)
    expect(result).toHaveLength(4)
    expect(result[0].type).toBe("operations")
    expect(result[1].type).toBe("content")
    expect(result[2].type).toBe("operations")
    expect(result[3].type).toBe("content")
  })

  it("handles consecutive GeneratingResponse entries", () => {
    const history = [
      statusEntry(AIOperationStatus.GeneratingResponse, {
        timestamp: 1,
        content: "first",
      }),
      statusEntry(AIOperationStatus.GeneratingResponse, {
        timestamp: 2,
        content: "second",
      }),
    ]
    const result = buildInterleavedTimeline(history)
    expect(result).toHaveLength(2)
    expect(result[0].type).toBe("content")
    expect(result[1].type).toBe("content")
  })

  it("handles only GeneratingResponse with no content", () => {
    const history = [
      statusEntry(AIOperationStatus.GeneratingResponse, { timestamp: 1 }),
    ]
    const result = buildInterleavedTimeline(history)
    expect(result).toHaveLength(0)
  })
})
