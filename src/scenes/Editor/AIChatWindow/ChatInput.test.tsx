// @vitest-environment jsdom
import React, { useState } from "react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, fireEvent, screen } from "@testing-library/react"
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

const configure = (
  status: AIOperationStatus | null,
  currentModel: string,
  overrides: Partial<ReturnType<typeof useAIStatus>> = {},
) =>
  vi.mocked(useAIStatus).mockReturnValue({
    status,
    currentModel,
    aiAssistantSettings: {},
    getOperationSignal: () => new AbortController().signal,
    ...overrides,
  } as ReturnType<typeof useAIStatus>)

const fakeChannel = (
  id: string,
  model?: { current: string; choices: { value: string; name: string }[] },
) => {
  const snapshot = {
    info: { id, label: id },
    acceptsImages: true,
    config: { model },
    questions: [],
    commands: [{ name: "summary", description: "Summarize", hint: null }],
  }
  return {
    getSnapshot: () => snapshot,
    isTransportReady: () => true,
    subscribe: () => () => undefined,
  } as unknown as LocalAgentChannel
}

const renderInput = (initial: LocalAgentChannel | null = null) => {
  let submitted: ChatQueue = {}
  const Input = ({
    channel,
    id,
  }: {
    channel: LocalAgentChannel | null
    id: string
  }) => {
    const [queue, setQueueState] = useState<ChatQueue>({})
    submitted = queue
    return (
      <LocalAgentContext.Provider value={channel}>
        <ChatInput
          conversationId={id}
          localAgentTransportReady={channel !== null}
          queue={queue}
          setQueue={(update) => {
            const next = update(submitted)
            if (next === submitted) return false
            submitted = next
            setQueueState(next)
            return true
          }}
          onContextClick={vi.fn()}
        />
      </LocalAgentContext.Provider>
    )
  }
  const view = renderComponent(<Input channel={initial} id="c1" />)
  return {
    submitted: (id = "c1") => submitted[id],
    rerender: (channel = initial, id = "c1") =>
      view.rerender(<Input channel={channel} id={id} />),
  }
}

it("keeps a mismatched queue across composer remounts until explicit Edit", async () => {
  configure(AIOperationStatus.Processing, LOCAL_AGENT_MODEL)
  const channel = fakeChannel("original")
  const view = renderInput(channel)
  await userEvent.type(
    getHook("chat-input-textarea"),
    "Queued follow-up{Enter}",
  )
  const entry = view.submitted()

  configure(null, "openai:gpt-5-mini")
  view.rerender(null, "c2")
  view.rerender(null, "c1")
  expect(view.submitted()).toBe(entry)
  expect(getHook("chat-queued-message")).toHaveTextContent(
    "Restore the original destination",
  )
  expect(getHook("chat-input-textarea")).toHaveValue("")

  await userEvent.click(screen.getByRole("button", { name: "Edit" }))
  expect(view.submitted()).toBeUndefined()
  expect(queryHook("chat-queued-message")).not.toBeInTheDocument()
  expect(getHook("chat-input-textarea")).toHaveValue("Queued follow-up")
})

it("cannot steer or append a new draft to a queue for a replaced local connection", async () => {
  const steerOperation = vi.fn()
  configure(AIOperationStatus.Processing, LOCAL_AGENT_MODEL, { steerOperation })
  const original = fakeChannel("agent")
  const view = renderInput(original)
  const input = getHook("chat-input-textarea")
  await userEvent.type(input, "Follow-up{Enter}")
  const entry = view.submitted()

  // Matching the name does not make a fresh connection the same destination.
  view.rerender(fakeChannel("agent"))
  expect(getHook("chat-queued-send-now")).toBeDisabled()
  await userEvent.click(getHook("chat-queued-send-now"))
  await userEvent.keyboard("{Control>}{Enter}{/Control}")
  await userEvent.type(input, "New draft{Enter}")
  await userEvent.keyboard("{Control>}{Enter}{/Control}")
  expect(steerOperation).not.toHaveBeenCalled()
  expect(view.submitted()).toBe(entry)
  expect(input).toHaveValue("New draft")

  view.rerender(original)
  expect(getHook("chat-queued-send-now")).toBeEnabled()
  await userEvent.click(getHook("chat-queued-send-now"))
  expect(steerOperation).toHaveBeenCalledOnce()
})

it("keeps the queue for its original model on the same agent channel", async () => {
  configure(AIOperationStatus.Processing, LOCAL_AGENT_MODEL)
  const model = {
    current: "fast",
    choices: [
      { value: "fast", name: "Fast" },
      { value: "deep", name: "Deep" },
    ],
  }
  const view = renderInput(fakeChannel("agent", model))
  await userEvent.type(getHook("chat-input-textarea"), "Follow-up{Enter}")
  expect(view.submitted()?.agentModel).toBe("fast")

  model.current = "deep"
  configure(null, LOCAL_AGENT_MODEL)
  view.rerender()
  expect(view.submitted()?.agentModel).toBe("fast")
  expect(getHook("chat-queued-message")).toHaveTextContent(
    "Restore the original destination",
  )
  expect(getHook("chat-input-textarea")).toHaveValue("")
  model.current = "fast"
  view.rerender()
  expect(getHook("chat-queued-message")).not.toHaveTextContent(
    "Restore the original destination",
  )
})

beforeEach(() => {
  // jsdom has no list scrolling; only exercise composer behavior.
  Element.prototype.scrollIntoView = vi.fn()
})

it("keeps a native slash command as a draft while an earlier message is queued", async () => {
  configure(AIOperationStatus.Processing, LOCAL_AGENT_MODEL)
  const view = renderInput(fakeChannel("agent"))
  const input = getHook("chat-input-textarea")
  await userEvent.type(input, "Explain the sample{Enter}")
  const first = view.submitted()
  await userEvent.type(input, "/sum")
  await userEvent.click(await screen.findByRole("option", { name: /summary/ }))
  expect(view.submitted()).toBe(first)
  expect(input).toHaveValue("/summary")
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Agent commands must send separately",
  )
})

it("does not append ordinary text to a native slash command in the queue", async () => {
  configure(AIOperationStatus.Processing, LOCAL_AGENT_MODEL)
  const view = renderInput(fakeChannel("agent"))
  const input = getHook("chat-input-textarea")
  await userEvent.type(input, "/summary{Enter}")
  expect(view.submitted()).toMatchObject({
    text: "/summary",
    agentCommand: true,
  })
  await userEvent.type(input, "Explain the sample{Enter}")
  expect(view.submitted()).toMatchObject({
    text: "/summary",
    agentCommand: true,
  })
  expect(input).toHaveValue("Explain the sample")
})

it("offers Queue for an image-only draft during a reply", async () => {
  configure(AIOperationStatus.Processing, LOCAL_AGENT_MODEL)
  const view = renderInput(fakeChannel("agent"))
  await userEvent.upload(
    getHook("chat-attach-image-input"),
    new File(["sample"], "reading.png", { type: "image/png" }),
  )
  await screen.findByRole("button", { name: "Remove image 1" })
  await userEvent.click(screen.getByRole("button", { name: "Queue message" }))
  expect(getHook("chat-queued-message")).toHaveTextContent("1 image")
  expect(view.submitted()?.images).toHaveLength(1)
})

it("preserves an image draft when adding it would exceed the queued limit", async () => {
  configure(AIOperationStatus.Processing, LOCAL_AGENT_MODEL)
  renderInput(fakeChannel("agent"))
  const picker = getHook("chat-attach-image-input")
  const upload = (count: number) =>
    userEvent.upload(
      picker,
      Array.from(
        { length: count },
        (_, i) =>
          new File(["sample"], `reading-${i}.png`, { type: "image/png" }),
      ),
    )
  await upload(3)
  await screen.findByRole("button", { name: "Remove image 3" })
  await userEvent.click(screen.getByRole("button", { name: "Queue message" }))
  await upload(2)
  await screen.findByRole("button", { name: "Remove image 2" })
  await userEvent.click(screen.getByRole("button", { name: "Queue message" }))
  expect(getHook("chat-queued-message")).toHaveTextContent("3 images")
  expect(
    screen.getByRole("button", { name: "Remove image 2" }),
  ).toBeInTheDocument()
  expect(screen.getByText(/a message takes up to 4 images/i)).toBeVisible()
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

  expect(view.submitted()).toBeUndefined()
  expect(getHook("chat-image-attachments")).toBeInTheDocument()
  expect(getHook("chat-input-textarea")).toHaveValue("What is shown?")
  expect(screen.getByText(/remove the attachments/)).toBeVisible()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const holdAttachment = () => {
  const readers: FileReader[] = []
  vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (
    this: FileReader,
  ) {
    readers.push(this)
  })
  fireEvent.change(getHook("chat-attach-image-input"), {
    target: {
      files: [new File(["sample"], "reading.png", { type: "image/png" })],
    },
  })
  return () =>
    act(async () => {
      await Promise.resolve()
      const [reader] = readers
      Object.defineProperty(reader, "result", {
        value: "data:image/png;base64,c2FtcGxl",
      })
      reader.dispatchEvent(new Event("load"))
    })
}

it("blocks Send and both Enter shortcuts until the attachment is ready", async () => {
  configure(null, LOCAL_AGENT_MODEL)
  const { submitted } = renderInput(fakeChannel("agent"))
  await userEvent.type(getHook("chat-input-textarea"), "Read this chart")
  const finish = holdAttachment()
  const send = screen.getByRole("button", { name: "Send message" })
  expect(send).toBeDisabled()
  await userEvent.keyboard("{Enter}{Control>}{Enter}{/Control}")
  expect(submitted()).toBeUndefined()
  await finish()
  await userEvent.click(send)
  expect(submitted()).toMatchObject({
    text: "Read this chart",
    images: [{ mimeType: "image/png", data: "c2FtcGxl" }],
  })
})

it("does not steer a queued message while reading the current draft image", async () => {
  const steerOperation = vi.fn()
  configure(AIOperationStatus.Processing, LOCAL_AGENT_MODEL, { steerOperation })
  const { submitted } = renderInput(fakeChannel("agent"))
  await userEvent.type(getHook("chat-input-textarea"), "Follow-up{Enter}")
  const finish = holdAttachment()
  const sendNow = getHook("chat-queued-send-now")
  expect(sendNow).toBeDisabled()
  await userEvent.click(sendNow)
  await userEvent.keyboard("{Control>}{Enter}{/Control}")
  expect(steerOperation).not.toHaveBeenCalled()
  expect(submitted()?.text).toBe("Follow-up")
  await finish()
  expect(sendNow).toBeEnabled()
})

it("clears the composer on conversation change and discards a late attachment read", async () => {
  configure(null, LOCAL_AGENT_MODEL)
  const view = renderInput(fakeChannel("agent"))
  await userEvent.upload(
    getHook("chat-attach-image-input"),
    new File(["sample"], "reading.png", { type: "image/png" }),
  )
  await screen.findByRole("button", { name: "Remove image 1" })
  await userEvent.type(getHook("chat-input-textarea"), "Previous draft")
  const finish = holdAttachment()
  view.rerender(undefined, "c2")
  expect(getHook("chat-input-textarea")).toHaveValue("")
  expect(queryHook("chat-image-attachments")).not.toBeInTheDocument()
  await userEvent.type(getHook("chat-input-textarea"), "New draft")
  await finish()
  expect(queryHook("chat-image-attachments")).not.toBeInTheDocument()
  await userEvent.keyboard("{Enter}")
  expect(view.submitted("c2")).toMatchObject({ text: "New draft", images: [] })
})
