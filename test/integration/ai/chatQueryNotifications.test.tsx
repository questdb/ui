// @vitest-environment jsdom
import {
  renderChat,
  openChat,
  seedChat,
  chatServer,
  getByHook,
} from "./support/chatHarness"
import React from "react"
import { expect, it } from "vitest"
import { waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import Notifications from "../../../src/scenes/Notifications"
import { questExecution } from "../../../src/utils/questdb/queryExecution"
import { createDetachedQueryKey } from "../../../src/scenes/Editor/Monaco/utils"

it("shows a failed chat query in notifications with its SQL and conversation identity", async () => {
  // Given
  const sql = "SELECT * FROM nonexistent_table_xyz"
  const chat = await seedChat("Invalid query", {
    messages: [
      {
        id: "question",
        role: "user",
        content: "Show this table",
        timestamp: Date.now(),
      },
      {
        id: "suggestion",
        role: "assistant",
        content: "Try this query.",
        sql,
        previousSQL: "",
        timestamp: Date.now() + 1,
      },
    ],
  })
  const server = chatServer("openai", [])
  server.other = (request) => {
    expect(new URL(request.url).pathname).toBe("/exec")
    expect(new URL(request.url).searchParams.get("query")).toBe(sql)
    return Response.json(
      {
        error: "table does not exist [table=nonexistent_table_xyz]",
        query: sql,
        position: 14,
      },
      { status: 400 },
    )
  }
  questExecution.reset()
  const { store } = renderChat(
    "openai",
    <Notifications
      targetBufferId={chat.id}
      onClearNotifications={() => undefined}
    />,
  )
  await openChat()
  await waitFor(() => expect(getByHook("message-action-run-sql")).toBeEnabled())

  // When
  await userEvent.click(getByHook("message-action-run-sql"))

  // Then
  await waitFor(() =>
    expect(getByHook("error-notification")).toHaveTextContent(
      "table does not exist [table=nonexistent_table_xyz]",
    ),
  )
  expect(getByHook("error-notification")).toHaveTextContent(sql)
  const queryKey = createDetachedQueryKey(sql)
  expect(
    store.getState().query.queryNotifications[chat.id][queryKey].latest,
  ).toMatchObject({ query: queryKey, type: "error" })
  expect(server.otherRequests).toHaveLength(1)
  questExecution.reset()
})
