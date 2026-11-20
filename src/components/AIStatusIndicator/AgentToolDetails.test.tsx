// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../test/component"
import { AIOperationStatus } from "../../providers/AIStatusProvider"
import { AssistantModesCompact } from "./AssistantModesCompact"
import { diffStats } from "./AgentToolDetails"

// Monaco does not run in jsdom; the diff shows its two texts.
vi.mock("@monaco-editor/react", () => ({
  loader: { config: () => undefined, init: () => Promise.resolve() },
  DiffEditor: ({
    original,
    modified,
  }: {
    original: string
    modified: string
  }) => <div data-hook="diff-editor">{`${original}→${modified}`}</div>,
  Editor: ({ value }: { value: string }) => (
    <div data-hook="file-editor">{value}</div>
  ),
}))

describe("an agent's tool step", () => {
  it("opens to show the files the tool changed and what it printed", async () => {
    // Given
    renderComponent(
      <AssistantModesCompact
        operationHistory={[
          { type: AIOperationStatus.Processing, timestamp: 1 },
          {
            type: AIOperationStatus.UsingAgentTools,
            args: {
              name: "Edit notes.txt",
              toolKind: "edit",
              callId: "c1",
              output: "Replaced 1 block.",
              diffs: [
                { path: "/tmp/notes.txt", oldText: "a\nb", newText: "a\nc" },
                { path: "/tmp/q.sql", oldText: null, newText: "select 1" },
              ],
            },
            timestamp: 2,
          },
        ]}
        status={AIOperationStatus.UsingAgentTools}
        isLive
      />,
    )
    expect(screen.queryByText("Replaced 1 block.")).toBeNull()

    // When
    await userEvent.click(
      screen.getByRole("button", { name: "Show what Edit notes.txt did" }),
    )

    // Then
    expect(screen.getByText("Replaced 1 block.")).toBeVisible()
    expect(
      document.querySelector('[data-hook="diff-editor"]'),
    ).toHaveTextContent("a b→a c")
    const [changed, created] = Array.from(
      document.querySelectorAll('[data-hook="agent-tool-diff"]'),
    )
    expect(changed).toHaveTextContent(/^notes\.txt\+1−1/)
    expect(created).toHaveTextContent(/^q\.sql\+1New file/)
    expect(screen.getByText("select 1")).toBeInTheDocument()
  })
})

describe("diffStats", () => {
  it("counts the lines added and removed", () => {
    expect(diffStats("a\nb\nc\n", "a\nc\nd\ne\n")).toEqual({
      added: 2,
      removed: 1,
    })
    expect(diffStats(null, "x\ny")).toEqual({ added: 2, removed: 0 })
  })
})
