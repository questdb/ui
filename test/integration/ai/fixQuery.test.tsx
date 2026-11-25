// @vitest-environment jsdom
import {
  renderChat,
  openChat,
  chatServer,
  fixtures,
  getAllByHook,
  queryByHook,
  gate,
  failQuery,
  seedChat,
} from "./support/chatHarness"
import { expect, it } from "vitest"
import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

it("starts one Fix answer for a double click, and Stop cancels its request", async () => {
  // Given a chat about a failed query and an answer that waits
  const sql = "SELECT * FROM tradess"
  const queryKey = failQuery(1, sql, {
    message: "table does not exist [table=tradess]",
    position: 14,
  })
  await seedChat("Failed query", {
    bufferId: 1,
    queryKey,
    currentSQL: sql,
    messages: [],
  })
  const reply = gate()
  const server = chatServer("openai", [
    async () => {
      await reply.promise
      return fixtures.createFinalResponse("openai", "Use the trades table.")
    },
  ])
  renderChat()
  await openChat()

  // When the user clicks Fix query twice before the chat re-renders
  const fix = screen.getByRole("button", { name: "Fix query" })
  act(() => {
    fix.click()
    fix.click()
  })

  // Then one answer starts
  await waitFor(() => expect(server.requests).toHaveLength(1))
  expect(getAllByHook("chat-message-user")).toHaveLength(1)
  expect(server.requests[0].request.signal.aborted).toBe(false)

  // When the user stops it
  await userEvent.click(
    screen.getByRole("button", { name: "Stop AI generation" }),
  )

  // Then its request is cancelled and the late answer is not shown
  expect(server.requests[0].request.signal.aborted).toBe(true)
  await reply.release()
  await waitFor(() =>
    expect(queryByHook("chat-stop-button")).not.toBeInTheDocument(),
  )
  expect(screen.queryByText("Use the trades table.")).not.toBeInTheDocument()
  expect(server.requests).toHaveLength(1)
})
