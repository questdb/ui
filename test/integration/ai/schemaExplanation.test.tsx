// @vitest-environment jsdom
import {
  renderChat,
  chatServer,
  fixtures,
  getByHook,
  getAllByHook,
  queryByHook,
} from "./support/chatHarness"
import { describe, expect, it, vi } from "vitest"
import React from "react"
import userEvent from "@testing-library/user-event"
import { Button } from "../../../src/components/Button"
import { useAIQuickActions } from "../../../src/hooks/useAIQuickActions"
import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import {
  raw,
  table,
} from "../../../src/scenes/Schema/TableDetailsDrawer/test/catalogFixtures"
import type { HealthIssue } from "../../../src/scenes/Schema/TableDetailsDrawer/healthCheck"

const finishRetries = async (releaseFirstResponse: () => void) => {
  const retryTime = Date.now()
  vi.useRealTimers()
  vi.useFakeTimers({
    toFake: [
      "Date",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
    ],
  })
  vi.setSystemTime(retryTime)
  await act(async () => {
    releaseFirstResponse()
    await vi.advanceTimersByTimeAsync(20000)
  })
}

describe("chat recovery", () => {
  it("opens the schema chat and reports the provider failure after bounded retries", async () => {
    // Given the real schema quick action and a provider that keeps returning HTTP 500
    const ExplainSchema = () => {
      const { handleExplainSchema } = useAIQuickActions()
      return (
        <Button
          onClick={() => {
            void handleExplainSchema(1, "test_trades", "table")
          }}
        >
          Explain schema
        </Button>
      )
    }
    const ddl = "CREATE TABLE test_trades (price DOUBLE);"
    const sqlRequests: string[] = []
    const providerBodies: Array<Record<string, unknown>> = []
    let releaseFirstResponse!: () => void
    const firstResponse = new Promise<void>((resolve) => {
      releaseFirstResponse = resolve
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request
            ? input
            : new Request(new URL(String(input), location.href), init)
        const url = new URL(request.url)
        if (url.pathname === "/exec") {
          sqlRequests.push(url.searchParams.get("query")!)
          return Response.json({
            columns: [{ name: "ddl", type: "STRING" }],
            dataset: [[ddl]],
            count: 1,
          })
        }
        expect(request.url).toBe("https://api.openai.com/v1/responses")
        providerBodies.push((await request.json()) as Record<string, unknown>)
        if (providerBodies.length === 1) await firstResponse
        return Response.json(
          { error: { type: "server_error", message: "Internal server error" } },
          { status: 500 },
        )
      }),
    )
    renderChat("openai", <ExplainSchema />)
    // When the quick action fetches the schema and exhausts the SDK and flow retries
    fireEvent.click(screen.getByRole("button", { name: "Explain schema" }))
    await waitFor(() => expect(providerBodies).toHaveLength(1))
    await finishRetries(releaseFirstResponse)

    // Then the chat shows a retryable error once the failed turn is saved.
    vi.useRealTimers()
    await waitFor(() => expect(getByHook("retry-button")).toBeEnabled())
    expect(sqlRequests).toEqual(["SHOW CREATE TABLE 'test_trades';"])
    expect(providerBodies).toHaveLength(9)
    expect(
      providerBodies.every((body) => JSON.stringify(body).includes(ddl)),
    ).toBe(true)
    expect(getByHook("ai-chat-window")).toBeVisible()
    expect(getByHook("chat-message-error")).toBeVisible()
    expect(queryByHook("chat-stop-button")).not.toBeInTheDocument()
  })
})

const suspended: HealthIssue = {
  id: "R1",
  severity: "critical",
  field: "table_suspended",
  message: "WAL is suspended",
  currentValue: "true",
}

const TableQuickActions = () => {
  const { handleExplainSchema, handleAskAIForHealthIssue } = useAIQuickActions()
  return (
    <>
      <Button onClick={() => void handleExplainSchema(1, "trades", "table")}>
        Explain schema
      </Button>
      <Button
        onClick={() => void handleAskAIForHealthIssue(1, "trades", suspended)}
      >
        Ask AI about the warning
      </Button>
    </>
  )
}

it.each(["Explain schema", "Ask AI about the warning"])(
  "reuses the table's chat and its answer when %s runs again",
  async (action) => {
    // Given the quick action answered once for the table
    const server = chatServer("openai", [
      fixtures.createFinalResponse("openai", "The table answer."),
    ])
    server.other = (request) => {
      const url = new URL(request.url)
      if (url.pathname.endsWith(".md"))
        return new Response("## Detect suspended tables\nResume the WAL.")
      const query = url.searchParams.get("query") ?? ""
      if (query.startsWith("tables()")) return Response.json(raw([table()]))
      if (query.startsWith("SHOW CREATE"))
        return Response.json(
          raw([{ ddl: "CREATE TABLE trades (price DOUBLE);" }]),
        )
      throw new Error(`Unexpected request: ${url}`)
    }
    renderChat("openai", <TableQuickActions />)
    const run = () =>
      userEvent.click(screen.getByRole("button", { name: action }))
    await run()
    await waitFor(() =>
      expect(getByHook("chat-message-assistant")).toHaveTextContent(
        "The table answer.",
      ),
    )
    await waitFor(() =>
      expect(queryByHook("chat-stop-button")).not.toBeInTheDocument(),
    )
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    // When the user runs it again on the same table
    await run()

    // Then the chat scrolls to the earlier question instead of asking again
    await waitFor(() =>
      expect(scrollIntoView.mock.instances).toContain(
        getByHook("chat-message-user"),
      ),
    )
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    })
    expect(server.requests).toHaveLength(1)
    expect(getAllByHook("chat-message-user")).toHaveLength(1)
    expect(getAllByHook("chat-message-assistant")).toHaveLength(1)
  },
)
