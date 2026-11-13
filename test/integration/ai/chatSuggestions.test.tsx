// @vitest-environment jsdom
import {
  renderChat,
  openChat,
  sendMessage,
  chatServer,
  fixtures,
  getByHook,
  getAllByHook,
  gate,
  seedChat,
  editorAdapter,
} from "./support/chatHarness"
import { describe, expect, it, vi } from "vitest"
import { waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { aiConversationStore } from "../../../src/store/aiConversations"
import { createQueryKey } from "../../../src/scenes/Editor/Monaco/utils"

const suggestion = (
  provider: "openai" | "anthropic",
  sql: string,
  explanation: string,
) => [
  fixtures.createToolCallResponse(provider, "suggest_query", { query: sql }),
  fixtures.createFinalResponse(provider, explanation),
]
const finishTurn = async (explanation: string) => {
  await waitFor(() =>
    expect(getAllByHook("chat-message-assistant").at(-1)).toHaveTextContent(
      explanation,
    ),
  )
  await waitFor(() =>
    expect(getAllByHook("message-action-accept")).toHaveLength(1),
  )
}

describe.each(["openai", "anthropic"] as const)(
  "%s follow-up suggestions",
  (provider) => {
    it("removes old decision controls while a follow-up is pending and enables only the new suggestion", async () => {
      // Given
      const next = gate()
      const server = chatServer(provider, [
        ...suggestion(
          provider,
          "SELECT symbol FROM btc_trades",
          "All symbols.",
        ),
        async () => {
          await next.promise
          return fixtures.createToolCallResponse(provider, "suggest_query", {
            query: "SELECT DISTINCT symbol FROM btc_trades",
          })
        },
        fixtures.createFinalResponse(provider, "Unique symbols."),
      ])
      renderChat(provider)
      await openChat()
      await sendMessage("Show symbols")
      await finishTurn("All symbols.")

      // When
      vi.setSystemTime(Date.now() + 3000)
      await sendMessage("Make them unique")
      await waitFor(() => expect(server.requests).toHaveLength(3))

      // Then
      expect(getAllByHook("inline-diff-container")[0]).toHaveTextContent(
        "Followed up",
      )
      expect(getAllByHook("message-action-accept")).toHaveLength(0)
      expect(getAllByHook("message-action-reject")).toHaveLength(0)
      await next.release()
      await finishTurn("Unique symbols.")
      const messages = getAllByHook("chat-message-assistant")
      expect(
        within(messages[0]).queryByRole("button", { name: "Accept" }),
      ).not.toBeInTheDocument()
      expect(
        within(messages[1]).getByRole("button", { name: "Accept" }),
      ).toBeEnabled()
      expect(
        within(messages[1]).getByRole("button", { name: "Reject" }),
      ).toBeEnabled()
      expect(messages[1]).toHaveTextContent(
        "SELECT DISTINCT symbol FROM btc_trades",
      )
    })
  },
)

it("sends decisions created by Accept and Reject in later requests and persists those decisions", async () => {
  // Given
  const buffer = { id: 42, label: "Query", value: "SELECT 0", position: 0 }
  const apply = vi.fn(({ newSQL }: { newSQL: string }) => {
    buffer.value = newSQL
    return { success: true, finalQueryKey: createQueryKey(newSQL, 0) }
  })
  editorAdapter.overrides = {
    buffers: [buffer],
    activeBuffer: buffer,
    applyAISQLChange: apply,
  }
  const chat = await seedChat("SQL refinement", {
    bufferId: buffer.id,
    queryKey: createQueryKey(buffer.value, 0),
    currentSQL: buffer.value,
    messages: [],
  })
  const server = chatServer(
    "openai",
    Array.from({ length: 6 }, (_, index) =>
      suggestion("openai", `SELECT ${index + 1}`, `Suggestion ${index + 1}.`),
    ).flat(),
  )
  renderChat()
  await openChat()

  const workspace =
    '<workspace>\n  active: { buffer_id: 42, label: "Query", kind: sql }\n  tabs:\n    - { buffer_id: 42, label: "Query", kind: sql }\n</workspace>\n\n'
  const expectedHistory: Array<{
    role: "user" | "assistant"
    content: string
  }> = []

  // When
  for (let turn = 1; turn <= 6; turn++) {
    expectedHistory.push({
      role: "user",
      content:
        workspace +
        (turn === 1
          ? "Current SQL query:\n```sql\nSELECT 0\n\n```\n\nUser request: select 1"
          : `select ${turn}`),
    })
    vi.setSystemTime(Date.now() + 3000)
    await sendMessage(`select ${turn}`)
    await finishTurn(`Suggestion ${turn}.`)
    const request = server.requests[(turn - 1) * 2].body
    const messages = request.input as Array<{
      type?: string
      role?: string
      content?: string | Array<{ type: string; text: string }>
    }>
    const history = messages
      .filter(
        (message) =>
          message.type !== "function_call" &&
          message.type !== "function_call_output",
      )
      .map((message) => ({
        role: message.role,
        content: Array.isArray(message.content)
          ? message.content.map((part) => part.text).join("")
          : message.content,
      }))
    const userMessages = history.filter((message) => message.role === "user")

    // Then
    expect(history).toEqual(expectedHistory)
    expect(userMessages.at(-1)?.content).toContain(`select ${turn}`)
    expectedHistory.push({ role: "assistant", content: `Suggestion ${turn}.` })
    if (turn === 2)
      expect(getAllByHook("inline-diff-container")[0]).toHaveTextContent(
        "Followed up",
      )
    if (turn === 3)
      expect(userMessages.at(-2)?.content).toMatch(
        /User accepted[\s\S]*SELECT 2/,
      )
    if (turn === 5)
      expect(userMessages.at(-2)?.content).toContain("User rejected")
    if (turn === 6)
      expect(userMessages.at(-2)?.content).toMatch(
        /User accepted[\s\S]*SELECT 5/,
      )
    if (turn === 2 || turn === 5) {
      await userEvent.click(getByHook("message-action-accept"))
      await waitFor(() =>
        expect(
          getAllByHook("inline-diff-container")[turn - 1],
        ).toHaveTextContent("Accepted"),
      )
      expect(buffer.value).toBe(`SELECT ${turn}`)
      expectedHistory.push({
        role: "user",
        content: `User accepted your SQL change. Now the query is:\n\n\`\`\`sql\nSELECT ${turn}\n\`\`\``,
      })
      expect(getByHook("chat-context-badge")).toHaveTextContent(
        `SELECT ${turn}`,
      )
    }
    if (turn === 4) {
      await userEvent.click(getByHook("message-action-reject"))
      await waitFor(() =>
        expect(
          getAllByHook("inline-diff-container")[turn - 1],
        ).toHaveTextContent("Rejected"),
      )
      expectedHistory.push({
        role: "user",
        content:
          "User rejected your latest change. Please use the previous version as the base for future modifications.",
      })
    }
  }
  expect(apply).toHaveBeenCalledTimes(2)
  await userEvent.click(getByHook("chat-window-close"))
  const stored = await aiConversationStore.getMessages(chat.id)
  expect(
    stored
      .filter((message) => message.isAccepted)
      .map((message) => message.sql),
  ).toEqual(["SELECT 2;", "SELECT 5;"])
  expect(
    stored
      .filter((message) => message.isRejected)
      .map((message) => message.sql),
  ).toEqual(["SELECT 4;"])
  expect(
    stored
      .filter((message) => message.hideFromUI)
      .map((message) => message.content)
      .join("\n"),
  ).toMatch(
    /User accepted[\s\S]*SELECT 2[\s\S]*User rejected[\s\S]*User accepted[\s\S]*SELECT 5/,
  )
})
