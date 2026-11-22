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
import { Button } from "../../../components"
import { LocalAgentContext } from "../../../utils/localAgent/LocalAgentContext"
import type {
  LocalAgentChannel,
  LocalAgentSnapshot,
} from "../../../utils/localAgent/localAgentChannel"
import type { AgentQuestionMessage } from "../../../utils/localAgent/protocol"
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
        <Button>Outside chat</Button>
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

it("holds the queued destination when Stop is pressed after switching models", async () => {
  const controller = new AbortController()
  const abortOperation = vi.fn(() => controller.abort())
  const operations = {
    abortOperation,
    getOperationSignal: () => controller.signal,
  }
  configure(AIOperationStatus.Processing, "openai:gpt-5.4", operations)
  const view = renderInput()
  await userEvent.type(
    getHook("chat-input-textarea"),
    "Follow-up{Enter}Separate draft",
  )
  configure(AIOperationStatus.Processing, "openai:gpt-5-mini", operations)
  view.rerender()
  await userEvent.click(getHook("chat-stop-button"))
  expect(abortOperation).toHaveBeenCalledOnce()
  expect(view.submitted()).toMatchObject({
    text: "Follow-up",
    model: "openai:gpt-5.4",
    heldByStop: true,
  })
  expect(getHook("chat-input-textarea")).toHaveValue("Separate draft")

  configure(null, "openai:gpt-5.4", operations)
  view.rerender()
  expect(getHook("chat-queued-message")).toHaveTextContent("Follow-up")
  await userEvent.click(screen.getByRole("button", { name: "Edit" }))
  expect(view.submitted()).toBeUndefined()
  expect(getHook("chat-input-textarea")).toHaveValue(
    "Follow-up\n\nSeparate draft",
  )
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

it.each(["text", "image"])(
  "keeps queued command Edit separate from a draft with %s",
  async (draft) => {
    configure(AIOperationStatus.Processing, LOCAL_AGENT_MODEL)
    const view = renderInput(fakeChannel("agent"))
    const user = userEvent.setup()
    const input = getHook("chat-input-textarea")
    await user.type(input, "/summary{Enter}")
    const queued = view.submitted()
    if (draft === "text") await user.type(input, "Separate draft")
    else {
      await user.upload(
        getHook("chat-attach-image-input"),
        new File(["sample"], "draft.png", { type: "image/png" }),
      )
      await screen.findByRole("img", { name: "Attachment 1" })
    }

    await user.click(screen.getByRole("button", { name: "Edit" }))
    expect(view.submitted()).toBe(queued)
    expect(getHook("chat-queued-message")).toHaveTextContent(
      "then choose Edit again to restore the queued command",
    )
    if (draft === "text") {
      expect(input).toHaveValue("Separate draft")
      await user.clear(input)
    } else {
      expect(input).toHaveValue("")
      expect(screen.getByRole("img", { name: "Attachment 1" })).toBeVisible()
      await user.click(screen.getByRole("button", { name: "Remove image 1" }))
    }
    await user.click(screen.getByRole("button", { name: "Edit" }))
    expect(view.submitted()).toBeUndefined()
    expect(input).toHaveValue("/summary")
    expect(input).toHaveFocus()
    expect(queryHook("chat-image-attachments")).not.toBeInTheDocument()
  },
)

const mixedClipboard = () =>
  ({
    items: [
      {
        kind: "file",
        type: "image/png",
        getAsFile: () =>
          new File(["sample"], "chart.png", { type: "image/png" }),
      },
    ],
    getData: (type: string) =>
      ["text/plain", "text"].includes(type) ? "row counts" : "",
  }) as unknown as DataTransfer

it.each(["API model", "text-only agent"])(
  "inserts mixed-paste text at the selection for a %s",
  async (model) => {
    const channel = fakeChannel("agent")
    channel.getSnapshot().acceptsImages = false
    configure(
      null,
      model === "API model" ? "openai:gpt-5-mini" : LOCAL_AGENT_MODEL,
    )
    renderInput(channel)
    const user = userEvent.setup()
    const input = getHook("chat-input-textarea") as HTMLTextAreaElement
    await user.type(input, "Show chart here")
    input.setSelectionRange(5, 10)
    await user.paste(mixedClipboard())
    expect(input).toHaveValue("Show row counts here")
    expect(queryHook("chat-image-attachments")).not.toBeInTheDocument()
    expect(queryHook("chat-attach-error")).not.toBeInTheDocument()
  },
)

it("attaches the image rather than inserting mixed-paste text for an image-capable agent", async () => {
  configure(null, LOCAL_AGENT_MODEL)
  renderInput(fakeChannel("agent"))
  const user = userEvent.setup()
  const input = getHook("chat-input-textarea")
  await user.type(input, "Existing draft")
  await user.paste(mixedClipboard())
  expect(await screen.findByRole("img", { name: "Attachment 1" })).toBeVisible()
  expect(input).toHaveValue("Existing draft")
})

it("inserts mixed-paste text at the selection when the image slots are full", async () => {
  configure(null, LOCAL_AGENT_MODEL)
  renderInput(fakeChannel("agent"))
  const user = userEvent.setup()
  await user.upload(
    getHook("chat-attach-image-input"),
    Array.from(
      { length: 4 },
      (_, index) =>
        new File([`sample ${index}`], `chart-${index}.png`, {
          type: "image/png",
        }),
    ),
  )
  await screen.findByRole("img", { name: "Attachment 4" })
  const sources = () =>
    screen
      .getAllByRole("img", { name: /Attachment \d/ })
      .map((img) => img.getAttribute("src"))
  const original = sources()
  const input = getHook("chat-input-textarea") as HTMLTextAreaElement
  await user.type(input, "Show chart here")
  input.setSelectionRange(5, 10)
  await user.paste(mixedClipboard())
  expect(input).toHaveValue("Show row counts here")
  expect(sources()).toEqual(original)
  expect(queryHook("chat-attach-error")).not.toBeInTheDocument()
})

const renderQuestions = (...ids: string[]) => {
  // Stop cancels the turn, and the channel clears its questions.
  let stopTurn = () => {}
  configure(AIOperationStatus.Processing, LOCAL_AGENT_MODEL, {
    abortOperation: () => stopTurn(),
  })
  const questions: AgentQuestionMessage[] = ids.map((requestId) => ({
    v: "0.6.0",
    type: "agent_question",
    requestId,
    conversationId: "c1",
    message: "Choose a display style",
    fields: [
      {
        id: "style",
        kind: "choice",
        title: null,
        prompt: null,
        options: [{ value: "compact", label: "Compact", description: null }],
        multiple: false,
        required: true,
        otherFieldId: null,
      },
    ],
  }))
  let snapshot: LocalAgentSnapshot = {
    ...fakeChannel("agent").getSnapshot(),
    questions,
  }
  let listener: (() => void) | undefined
  const answerQuestion = vi.fn<
    Parameters<LocalAgentChannel["answerQuestion"]>,
    boolean
  >((requestId) => {
    snapshot = {
      ...snapshot,
      questions: snapshot.questions.filter(
        (pending) => pending.requestId !== requestId,
      ),
    }
    listener?.()
    return true
  })
  const channel = {
    getSnapshot: () => snapshot,
    isTransportReady: () => true,
    subscribe: (notify: () => void) => {
      listener = notify
      return () => {
        listener = undefined
      }
    },
    answerQuestion,
  } as unknown as LocalAgentChannel
  stopTurn = () => {
    snapshot = { ...snapshot, questions: [] }
    listener?.()
  }
  renderInput(channel)
  return answerQuestion
}

it.each(["answer", "skip"])(
  "focuses the next question, then the composer after keyboard %s",
  async (action) => {
    const answer = renderQuestions("first", "last")
    const user = userEvent.setup()
    getHook("chat-question-option").focus()
    await user.keyboard("{Enter}")
    expect(answer).toHaveBeenLastCalledWith("first", { style: "compact" })
    expect(document.getElementById("question-last")).toHaveFocus()
    expect(queryHook("chat-input-textarea")).not.toBeInTheDocument()

    const skip = action === "skip"
    getHook(skip ? "chat-question-skip" : "chat-question-option").focus()
    await user.keyboard("{Enter}")
    expect(answer).toHaveBeenLastCalledWith(
      "last",
      skip ? null : { style: "compact" },
    )
    const input = getHook("chat-input-textarea")
    expect(input).toHaveFocus()
    await user.keyboard("Follow-up")
    expect(input).toHaveValue("Follow-up")
  },
)

it("does not steal focus from outside the chat when the last question is dismissed", () => {
  renderQuestions("last")
  const outside = screen.getByRole("button", { name: "Outside chat" })
  outside.focus()
  // Dispatch a click without moving focus off the external control.
  fireEvent.click(getHook("chat-question-skip"))
  expect(getHook("chat-input-textarea")).toBeEnabled()
  expect(outside).toHaveFocus()
})

it("returns focus to the composer when Stop removes a question", async () => {
  renderQuestions("last")
  const user = userEvent.setup()
  getHook("chat-question-stop").focus()
  await user.keyboard("{Enter}")
  expect(queryHook("chat-question-option")).not.toBeInTheDocument()
  expect(getHook("chat-input-textarea")).toHaveFocus()
})

it("does not send on the Enter that confirms an IME candidate", async () => {
  configure(null, "openai:gpt-5")
  const { submitted } = renderInput()
  const input = getHook("chat-input-textarea")
  await userEvent.type(input, "Explain this")
  fireEvent.keyDown(input, { key: "Enter", isComposing: false, keyCode: 229 })
  expect(submitted()).toBeUndefined()
  expect(input).toHaveValue("Explain this")
  await userEvent.keyboard("{Enter}")
  expect(submitted()).toMatchObject({ text: "Explain this" })
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

  const edit = screen.getByRole("button", { name: "Edit" })
  expect(edit).toBeDisabled()
  expect(getHook("chat-queued-message")).toHaveTextContent(
    /Remove draft images before editing/,
  )
  await userEvent.click(getHook("chat-input-textarea"))
  await userEvent.keyboard("{ArrowUp}")
  expect(getHook("chat-queued-message")).toHaveTextContent("3 images")
  expect(
    screen.queryByRole("button", { name: "Remove image 3" }),
  ).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Remove image 2" }))
  await userEvent.click(edit)
  expect(queryHook("chat-queued-message")).not.toBeInTheDocument()
  expect(
    screen.getByRole("button", { name: "Remove image 4" }),
  ).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Queue message" }))
  expect(getHook("chat-queued-message")).toHaveTextContent("4 images")
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

it("allows the native text paste while an earlier image is still loading", async () => {
  configure(null, LOCAL_AGENT_MODEL)
  renderInput(fakeChannel("agent"))
  const finish = holdAttachment()
  const clipboardImage = new File(["sample"], "clipboard.png", {
    type: "image/png",
  })
  const textarea = getHook("chat-input-textarea")
  const clipboardData = {
    items: [
      {
        kind: "file",
        type: clipboardImage.type,
        getAsFile: () => clipboardImage,
      },
    ],
    getData: () => "Caption from the clipboard",
  }
  // jsdom does not perform the default insertion; assert the event is not cancelled.
  expect(fireEvent.paste(textarea, { clipboardData })).toBe(true)
  expect(
    fireEvent.paste(textarea, {
      clipboardData: { ...clipboardData, getData: () => "" },
    }),
  ).toBe(false)
  expect(screen.getByRole("alert")).toHaveTextContent(/finish reading/)
  await finish()
  expect(screen.getAllByRole("button", { name: /Remove image/ })).toHaveLength(
    1,
  )
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
