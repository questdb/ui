// @vitest-environment jsdom
import React from "react"
import { act, fireEvent } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { getHook, queryHook, renderComponent } from "../../../test/component"
import { AIOperationStatus } from "../../../providers/AIStatusProvider"
import { ChatMessages } from "./ChatMessages"

vi.mock("react-redux", () => ({ useDispatch: vi.fn(), useSelector: () => [] }))
vi.mock("../../../providers/AIStatusProvider", async (load) => ({
  ...(await load<typeof import("../../../providers/AIStatusProvider")>()),
  useAIStatus: () => ({ status: AIOperationStatus.UsingAgentTools }),
}))

it("does not resume transcript follow when wheel input scrolls expanded tool output", async () => {
  vi.useFakeTimers()
  const scrollIntoView = vi.fn()
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(
    Element.prototype,
    "scrollIntoView",
  )
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  })
  try {
    renderComponent(
      <ChatMessages
        messages={[
          { id: "user", role: "user", timestamp: 0, content: "Show output" },
          {
            id: "assistant",
            role: "assistant",
            timestamp: 1,
            content: "",
            operationHistory: [
              {
                type: AIOperationStatus.UsingAgentTools,
                timestamp: 2,
                args: {
                  name: "List sample lines",
                  output: "Sample line\n".repeat(100),
                },
              },
            ],
          },
        ]}
        onOpenInEditor={vi.fn()}
        onScrollToMessageComplete={vi.fn()}
        isOperationInProgress
        isStreaming
      />,
    )
    await act(() => vi.advanceTimersByTimeAsync(1))
    fireEvent.click(getHook("agent-tool-toggle"))
    await act(() => vi.advanceTimersByTimeAsync(1))
    const output = getHook("agent-tool-output")
    const transcript = getHook("chat-messages-container")
    Object.defineProperties(output, {
      clientHeight: { value: 320 },
      scrollHeight: { value: 1600 },
    })
    Object.defineProperties(transcript, {
      clientHeight: { value: 450 },
      scrollHeight: { value: 1400, configurable: true },
    })
    fireEvent.wheel(transcript, { deltaY: -60 })
    transcript.scrollTop = 700
    fireEvent.scroll(transcript, { bubbles: false })
    expect(getHook("chat-scroll-to-end")).toBeVisible()
    scrollIntoView.mockClear()

    // jsdom does not run the wheel default action; apply only the inner scroll.
    output.scrollTop = 100
    fireEvent.wheel(output, { deltaY: 60 })
    output.scrollTop = 160
    fireEvent.scroll(output, { bubbles: false })
    await act(() => vi.advanceTimersByTimeAsync(700))
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(getHook("chat-scroll-to-end")).toBeVisible()

    // When the output is at its edge, the same gesture can chain to the transcript.
    output.scrollTop = 1280
    fireEvent.wheel(output, { deltaY: 300 })
    transcript.scrollTop = 950
    // The stream grew during the gesture; proximity alone cannot resume.
    Object.defineProperty(transcript, "scrollHeight", { value: 1450 })
    fireEvent.scroll(transcript, { bubbles: false })
    await act(() => vi.advanceTimersByTimeAsync(700))
    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(queryHook("chat-scroll-to-end")).not.toBeInTheDocument()
  } finally {
    if (originalScrollIntoView) {
      Object.defineProperty(
        Element.prototype,
        "scrollIntoView",
        originalScrollIntoView,
      )
    } else {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView")
    }
  }
})
