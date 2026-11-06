// @vitest-environment jsdom
import { renderChat, getByHook, queryByHook } from "./support/chatHarness"
import { describe, expect, it, vi } from "vitest"
import React from "react"
import { Button } from "../../../src/components/Button"
import { useAIQuickActions } from "../../../src/hooks/useAIQuickActions"
import { act, fireEvent, screen, waitFor } from "@testing-library/react"

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

const finishScroll = async () => {
  await act(async () => {
    const scrolled = new Promise<void>((resolve) => setTimeout(resolve, 0))
    await vi.advanceTimersByTimeAsync(0)
    await scrolled
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

    // Then the chat shows a retryable error with the actual schema request preserved
    expect(sqlRequests).toEqual(["SHOW CREATE TABLE 'test_trades';"])
    expect(providerBodies).toHaveLength(9)
    expect(
      providerBodies.every((body) => JSON.stringify(body).includes(ddl)),
    ).toBe(true)
    expect(getByHook("ai-chat-window")).toBeVisible()
    expect(getByHook("chat-message-error")).toBeVisible()
    expect(getByHook("retry-button")).toBeVisible()
    expect(queryByHook("chat-stop-button")).not.toBeInTheDocument()
    await finishScroll()
  })
})
