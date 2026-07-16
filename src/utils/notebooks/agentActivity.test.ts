import { describe, it, expect, beforeEach } from "vitest"
import {
  emitAgentEdit,
  onAgentEdit,
  __resetAgentActivityForTests,
  type AgentEdit,
} from "./agentActivity"

beforeEach(() => {
  __resetAgentActivityForTests()
})

describe("agentActivity", () => {
  it("delivers a cell edit (bufferId + cellId) to subscribers", () => {
    // Given a subscriber
    const seen: AgentEdit[] = []
    onAgentEdit((e) => seen.push(e))
    // When an agent edits a specific cell
    emitAgentEdit({ bufferId: 7, cellId: "d" })
    // Then the subscriber receives the buffer and cell
    expect(seen).toEqual([{ bufferId: 7, cellId: "d" }])
  })

  it("delivers a notebook-level edit with no cellId", () => {
    // Given a subscriber
    const seen: AgentEdit[] = []
    onAgentEdit((e) => seen.push(e))
    // When the agent makes a notebook-level change
    emitAgentEdit({ bufferId: 7 })
    // Then it carries no cell id
    expect(seen).toEqual([{ bufferId: 7 }])
  })

  it("stops delivering after unsubscribe", () => {
    // Given a subscriber that later unsubscribes
    const seen: AgentEdit[] = []
    const off = onAgentEdit((e) => seen.push(e))
    off()
    // When an edit is emitted
    emitAgentEdit({ bufferId: 7 })
    // Then nothing is delivered
    expect(seen).toHaveLength(0)
  })
})
