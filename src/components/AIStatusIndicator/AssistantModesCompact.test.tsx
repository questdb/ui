// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../test/component"
import {
  AIOperationStatus,
  type OperationHistory,
} from "../../providers/AIStatusProvider"
import { AssistantModesCompact } from "./AssistantModesCompact"

const { copyToClipboard } = vi.hoisted(() => ({
  copyToClipboard: vi.fn(() => Promise.resolve()),
}))
vi.mock("../../utils/copyToClipboard", () => ({ copyToClipboard }))

const failedTableLookup: OperationHistory = [
  { type: AIOperationStatus.Processing, timestamp: 1 },
  {
    type: AIOperationStatus.InvestigatingTable,
    args: {
      name: "trades",
      tableOpType: "details",
      failed: "Table details not found",
    },
    timestamp: 2,
  },
  { type: AIOperationStatus.RetrievingTables, timestamp: 3 },
]

const stepState = (hook: string) =>
  document
    .querySelector(`[data-hook="${hook}"] [data-state]`)
    ?.getAttribute("data-state")

describe("AssistantModesCompact", () => {
  it("shows a failed step as failed, with its reason, even while it is the latest", () => {
    // When
    renderComponent(
      <AssistantModesCompact
        operationHistory={[
          ...failedTableLookup.slice(0, 2),
          {
            type: AIOperationStatus.RetrievingTables,
            args: { failed: "Schema access is not granted" },
            timestamp: 3,
          },
        ]}
        status={AIOperationStatus.RetrievingTables}
        isLive
      />,
    )

    // Then
    expect(
      screen.getByText("Reviewing tables failed: Schema access is not granted"),
    ).toBeVisible()
    expect(stepState("assistant-mode-reviewing-tables")).toBe("failed")
  })

  it("keeps a failed step's reason under the step once the answer has moved on", () => {
    // When
    renderComponent(
      <AssistantModesCompact
        operationHistory={failedTableLookup}
        status={AIOperationStatus.RetrievingTables}
        isLive
      />,
    )

    // Then
    expect(
      screen.getByText("Table details not found", { exact: false }),
    ).toBeInTheDocument()
    expect(stepState("assistant-mode-investigating-table")).toBe("failed")
    expect(stepState("assistant-mode-reviewing-tables")).toBe("running")
  })

  it("shows a plan as done only once every item is", () => {
    // Given
    const plan = (status: string) => [
      { type: AIOperationStatus.Processing, timestamp: 1 },
      {
        type: AIOperationStatus.Planning,
        args: {
          plan: [
            { content: "Read the schema", status: "completed" },
            { content: "Write the query", status },
          ],
          callId: "plan",
        },
        timestamp: 2,
        endedAt: 2,
      },
      {
        type: AIOperationStatus.UsingAgentTools,
        args: { name: "ls" },
        timestamp: 3,
      },
    ]

    // When the agent still works on it
    const { rerender } = renderComponent(
      <AssistantModesCompact
        operationHistory={plan("in_progress")}
        status={AIOperationStatus.UsingAgentTools}
        isLive
      />,
    )

    // Then
    expect(stepState("assistant-mode-plan")).toBe("running")
    expect(screen.getByText("1/2")).toBeVisible()

    // When the answer ends with an item open, and when every item is done
    rerender(
      <AssistantModesCompact
        operationHistory={plan("pending")}
        status={null}
        isLive={false}
      />,
    )
    expect(stepState("assistant-mode-plan")).toBe("open")
    rerender(
      <AssistantModesCompact
        operationHistory={plan("completed")}
        status={null}
        isLive={false}
      />,
    )
    expect(stepState("assistant-mode-plan")).toBe("done")
  })

  it("opens a saved answer that holds a step without a type, as an earlier build saved a tool it did not have", () => {
    // Given the steps saved after the model called a tool named "constructor"
    const saved = [
      { type: AIOperationStatus.Processing, timestamp: 1 },
      {
        args: { failed: "Unknown tool: constructor" },
        timestamp: 2,
        endedAt: 2,
      },
      { type: AIOperationStatus.RetrievingTables, timestamp: 3, endedAt: 4 },
    ] as OperationHistory

    // When
    renderComponent(
      <AssistantModesCompact
        operationHistory={saved}
        status={null}
        isLive={false}
      />,
    )

    // Then the steps it can name show, and the one it cannot does not
    expect(stepState("assistant-mode-processing-request")).toBe("done")
    expect(stepState("assistant-mode-reviewing-tables")).toBe("done")
    expect(screen.queryByText(/Unknown tool/)).not.toBeInTheDocument()
  })

  it("shows how long each step's own tool took, and how long the answer worked in all", async () => {
    // Given a query that ran for 300ms, then the model worked for 9.7s
    const history: OperationHistory = [
      { type: AIOperationStatus.Processing, timestamp: 10_000 },
      {
        type: AIOperationStatus.RunningQuery,
        args: { content: "select 1" },
        content: "select 1",
        timestamp: 11_000,
        endedAt: 11_300,
      },
      { type: AIOperationStatus.Thinking, timestamp: 21_000 },
    ]

    // When
    renderComponent(
      <AssistantModesCompact
        operationHistory={history}
        status={null}
        isLive={false}
        collapsed
        endTimestamp={22_000}
      />,
    )

    // Then
    await userEvent.click(screen.getByText("Worked for 12s"))
    expect(screen.getByText("(300ms)")).toBeVisible()
  })

  it("shows an agent's command whole, line breaks and all, in a box that scrolls", () => {
    // Given
    const command = "node -e 'const p=1\nconsole.log(p)'"

    // When
    renderComponent(
      <AssistantModesCompact
        operationHistory={[
          { type: AIOperationStatus.Processing, timestamp: 1 },
          {
            type: AIOperationStatus.UsingAgentTools,
            args: { name: command, toolKind: "execute", callId: "c1" },
            timestamp: 2,
          },
        ]}
        status={AIOperationStatus.UsingAgentTools}
        isLive
      />,
    )

    // Then
    const box = document.querySelector(
      '[data-hook="assistant-mode-command"]',
    ) as HTMLElement
    expect(box.textContent).toBe(command)
    expect(getComputedStyle(box).whiteSpace).toBe("pre")
    expect(getComputedStyle(box).overflow).toBe("auto")
  })

  it("shows each validated query in the editor's font, with why it is invalid", () => {
    // When
    renderComponent(
      <AssistantModesCompact
        operationHistory={[
          {
            type: AIOperationStatus.ValidatingQuery,
            args: { content: "SELECT 1" },
            content: "SELECT 1",
            timestamp: 1,
          },
          {
            type: AIOperationStatus.ValidatingQuery,
            args: { content: "SELECT prices", failed: "unknown column" },
            content: "SELECT prices",
            timestamp: 2,
          },
        ]}
        status={AIOperationStatus.ValidatingQuery}
        isLive
      />,
    )

    // Then
    const queries = document.querySelectorAll(
      '[data-hook="assistant-mode-query"]',
    )
    expect(Array.from(queries, (query) => query.textContent)).toEqual([
      "SELECT 1",
      "SELECT prices",
    ])
    expect(screen.getByText("unknown column")).toBeInTheDocument()
    expect(stepState("assistant-mode-validating-query")).toBe("failed")
  })

  it("copies each query on its own", async () => {
    // Given two queries the assistant ran
    renderComponent(
      <AssistantModesCompact
        operationHistory={[
          {
            type: AIOperationStatus.RunningQuery,
            args: { content: "SELECT 1" },
            content: "SELECT 1",
            timestamp: 1,
          },
          {
            type: AIOperationStatus.RunningQuery,
            args: { content: "SELECT count() FROM trades" },
            content: "SELECT count() FROM trades",
            timestamp: 2,
          },
        ]}
        status={AIOperationStatus.RunningQuery}
        isLive
      />,
    )

    // When
    const [, second] = screen.getAllByRole("button", { name: "Copy query" })
    await userEvent.click(second)

    // Then
    expect(copyToClipboard).toHaveBeenCalledWith("SELECT count() FROM trades")
  })
})
