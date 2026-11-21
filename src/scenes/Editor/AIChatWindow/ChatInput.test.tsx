// @vitest-environment jsdom
import React from "react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"
import { getHook, queryHook, renderComponent } from "../../../test/component"
import {
  AIOperationStatus,
  useAIStatus,
} from "../../../providers/AIStatusProvider"
import { LOCAL_AGENT_MODEL } from "../../../utils/localAgent/localAgentModel"
import { ChatInput } from "./ChatInput"

vi.mock("react-redux", () => ({ useSelector: () => [] }))
vi.mock("../../../providers/AIStatusProvider", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../providers/AIStatusProvider")
  >()),
  useAIStatus: vi.fn(),
}))
vi.mock("./ComposerControls", () => ({ ComposerControls: () => null }))
vi.mock("./ComposerControls/useComposerModel", () => ({
  useComposerModel: () => ({ effort: null, usesAgent: false }),
}))

it("restores a queued draft if the selected model changes before delivery", async () => {
  // Given a follow-up queued for the local agent
  const onSend = vi.fn()
  const configure = (status: AIOperationStatus | null, currentModel: string) =>
    vi.mocked(useAIStatus).mockReturnValue({
      status,
      currentModel,
    } as ReturnType<typeof useAIStatus>)
  const input = () => (
    <ChatInput conversationId="c1" onSend={onSend} onContextClick={vi.fn()} />
  )
  configure(AIOperationStatus.Processing, LOCAL_AGENT_MODEL)
  const view = renderComponent(input())
  await userEvent.type(
    getHook("chat-input-textarea"),
    "Queued follow-up{Enter}",
  )
  expect(getHook("chat-queued-message-text")).toHaveTextContent(
    "Queued follow-up",
  )

  // When the pending turn ends and the API model becomes active
  configure(null, "openai:gpt-5-mini")
  view.rerender(input())

  // Then the draft requires an explicit send with the new model
  expect(onSend).not.toHaveBeenCalled()
  expect(queryHook("chat-queued-message")).not.toBeInTheDocument()
  expect(getHook("chat-input-textarea")).toHaveValue("Queued follow-up")
})
