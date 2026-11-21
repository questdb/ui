// @vitest-environment jsdom
import React, { useState } from "react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { getHook, queryHook, renderComponent } from "../../../test/component"
import {
  AIOperationStatus,
  useAIStatus,
} from "../../../providers/AIStatusProvider"
import { LOCAL_AGENT_MODEL } from "../../../utils/localAgent/localAgentModel"
import { LocalAgentContext } from "../../../utils/localAgent/LocalAgentContext"
import type { LocalAgentChannel } from "../../../utils/localAgent/localAgentChannel"
import { ChatInput, type ChatQueue } from "./ChatInput"

vi.mock("react-redux", () => ({ useSelector: () => [] }))
vi.mock("../../../providers/AIStatusProvider", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../providers/AIStatusProvider")
  >()),
  useAIStatus: vi.fn(),
}))
vi.mock("./ComposerControls", () => ({ ComposerControls: () => null }))
vi.mock("./ComposerControls/useComposerModel", () => ({
  useComposerModel: () => ({
    effort: null,
    usesAgent: useAIStatus().currentModel === LOCAL_AGENT_MODEL,
  }),
}))

const configure = (status: AIOperationStatus | null, currentModel: string) =>
  vi
    .mocked(useAIStatus)
    .mockReturnValue({ status, currentModel } as ReturnType<typeof useAIStatus>)

const fakeChannel = (id: string) => {
  const snapshot = {
    info: { id, label: id },
    acceptsImages: true,
    questions: [],
    commands: [],
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
  } as unknown as LocalAgentChannel
}

const renderInput = (initial: LocalAgentChannel | null = null) => {
  const onSend = vi.fn()
  const Input = ({ channel }: { channel: LocalAgentChannel | null }) => {
    const [queue, setQueue] = useState<ChatQueue>({})
    return (
      <LocalAgentContext.Provider value={channel}>
        <ChatInput
          conversationId="c1"
          queue={queue}
          setQueue={setQueue}
          onSend={onSend}
          onContextClick={vi.fn()}
        />
      </LocalAgentContext.Provider>
    )
  }
  const view = renderComponent(<Input channel={initial} />)
  return {
    onSend,
    rerender: (channel = initial) => view.rerender(<Input channel={channel} />),
  }
}

it("restores a queued draft if the selected model changes before delivery", async () => {
  // Given a follow-up queued for the local agent
  configure(AIOperationStatus.Processing, LOCAL_AGENT_MODEL)
  const view = renderInput()
  await userEvent.type(
    getHook("chat-input-textarea"),
    "Queued follow-up{Enter}",
  )
  expect(getHook("chat-queued-message-text")).toHaveTextContent(
    "Queued follow-up",
  )

  // When the pending turn ends and the API model becomes active
  configure(null, "openai:gpt-5-mini")
  view.rerender()

  // Then the draft requires an explicit send with the new model
  expect(view.onSend).not.toHaveBeenCalled()
  expect(queryHook("chat-queued-message")).not.toBeInTheDocument()
  expect(getHook("chat-input-textarea")).toHaveValue("Queued follow-up")
})

it("requires a fresh send when the local connection is replaced", async () => {
  configure(AIOperationStatus.Processing, LOCAL_AGENT_MODEL)
  const view = renderInput(fakeChannel("old"))
  await userEvent.type(getHook("chat-input-textarea"), "Follow-up{Enter}")
  expect(getHook("chat-queued-message-text")).toHaveTextContent("Follow-up")

  configure(null, LOCAL_AGENT_MODEL)
  view.rerender(fakeChannel("new"))

  expect(view.onSend).not.toHaveBeenCalled()
  expect(getHook("chat-input-textarea")).toHaveValue("Follow-up")
})

it("keeps attached images in a draft rather than sending without them", async () => {
  configure(null, LOCAL_AGENT_MODEL)
  const view = renderInput(fakeChannel("agent"))
  await userEvent.upload(
    getHook("chat-attach-image-input"),
    new File(["sample"], "reading.png", { type: "image/png" }),
  )
  await screen.findByRole("button", { name: "Remove image 1" })
  configure(null, "openai:gpt-5-mini")
  view.rerender()

  await userEvent.type(getHook("chat-input-textarea"), "What is shown?{Enter}")

  expect(view.onSend).not.toHaveBeenCalled()
  expect(getHook("chat-image-attachments")).toBeInTheDocument()
  expect(getHook("chat-input-textarea")).toHaveValue("What is shown?")
  expect(screen.getByText(/remove the attachments/)).toBeVisible()
})
