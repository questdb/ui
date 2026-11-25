import type { ContextUsage } from "../../../utils/ai/aiAssistant"
import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useId,
} from "react"
import { useSelector } from "react-redux"
import styled from "styled-components"
import { Box, Button, IconButton, TextArea } from "../../../components"
import { color } from "../../../utils"
import {
  ArrowUpIcon,
  CodeBlockIcon,
  ImageIcon,
  NotebookIcon,
  StopIcon,
} from "@phosphor-icons/react"
import {
  useAIStatus,
  isBlockingAIStatus,
  STEERED_ABORT_REASON,
} from "../../../providers/AIStatusProvider"
import { TableIcon } from "../../Schema/table-icon"
import { getTableKind } from "../../../utils/questdb/types"
import { selectors } from "../../../store"
import {
  useLocalAgent,
  useLocalAgentChannel,
} from "../../../utils/localAgent/LocalAgentContext"
import { QuestionCard, type QuestionDrafts } from "./QuestionCard"
import { LinkRequestCard } from "./LinkRequestCard"
import {
  IMAGE_TYPES,
  ImageAttachments,
  MAX_IMAGES,
  exceedsImageLimit,
  readImages,
} from "./ImageAttachments"
import type { AgentPromptImage } from "../../../utils/localAgent/protocol"
import {
  effectiveAgentModel,
  modelFromAgentConfig,
  LOCAL_AGENT_MODEL,
} from "../../../utils/localAgent/localAgentModel"
import { localAgentPreferencesOf } from "../../../utils/localAgent/localAgentSettings"
import type { AiAssistantSettings } from "../../../providers/LocalStorageProvider/types"
import {
  CommandArgumentHint,
  SlashCommandMenu,
  commandOptionId,
} from "./SlashCommandMenu"
import {
  availableCommands,
  matchingCommands,
  parseCommand,
  resolveEffort,
  resolveModel,
  typedCommandQuery,
  type SlashCommand,
} from "./slashCommands"
import { useComposerModel } from "./ComposerControls/useComposerModel"
import type { PickerRequest } from "./ComposerControls"
import { ComposerControls } from "./ComposerControls"
import type { TokenUsageCounts } from "./ComposerControls/TokenUsage"
import { QueuedMessage } from "./QueuedMessage"
import { ctrlCmd } from "../../../utils/platform"
import { isImeKeyEvent } from "../../../utils/isImeKeyEvent"

const InputContainer = styled(Box)<{ $hasQuestion: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.8rem;
  padding: 1rem 1.2rem;
  flex-shrink: ${({ $hasQuestion }) => ($hasQuestion ? 1 : 0)};
  min-height: 0;
  max-height: 100%;
  width: 100%;
  margin-top: auto;
  border-top: 1px solid ${color("interactionNeutral")};
`

// Holds the command menu above the message box, which clips its own content.
const ComposerField = styled.div`
  position: relative;
  width: 100%;
`

// Why an image could not be attached.
const AttachError = styled.p`
  margin: -0.2rem 0 0;
  font-size: 1.2rem;
  line-height: 1.5;
  color: ${color("statusDanger")};
`

// Attached images sit inside the message box, above the text.
const ComposerAttachments = styled.div<{ $top: string }>`
  position: absolute;
  top: ${({ $top }) => $top};
  left: 1.2rem;
  right: 1.2rem;
  z-index: 1;
  pointer-events: none;
`

const ATTACHMENT_SIZE = 4.8

const InputWrapper = styled(Box)`
  display: flex;
  position: relative;
  width: 100%;
  overflow: hidden;
`

const StyledTextArea = styled(TextArea).attrs({ $tone: "accent" })<{
  $paddingTop: string
  $paddingRight: string
}>`
  flex: 1;
  min-height: 8rem;
  max-height: 30rem;
  line-height: 1.3;
  padding: ${({ $paddingTop, $paddingRight }) =>
    `${$paddingTop} ${$paddingRight} 1.2rem 1.2rem`};
  resize: none;
`

const SendButton = styled(IconButton)`
  position: absolute;
  right: 0.8rem;
  bottom: 0.8rem;
`

const StopButton = styled(SendButton)<{ $alongsideSend: boolean }>`
  right: ${({ $alongsideSend }) => ($alongsideSend ? "4.8rem" : "0.8rem")};
`

const AttachButton = styled(IconButton)<{ $alongsideStop: boolean }>`
  position: absolute;
  right: ${({ $alongsideStop }) => ($alongsideStop ? "8.8rem" : "4.8rem")};
  bottom: 0.8rem;
`

// A submitted message waiting for the answer to end or for context preparation.
export type QueuedEntry = {
  text: string
  images: AgentPromptImage[]
  agentCommand: boolean
  model: string | null
  channel: ReturnType<typeof useLocalAgentChannel>
  agentModel: string | null
  agentModelPreference: string | null
  awaitingInitialAgentModel: boolean
  heldByStop?: boolean
  waitingFor?: AbortSignal
}

export type ChatQueue = Record<string, QueuedEntry>

export const agentDestination = (
  agent: ReturnType<typeof useLocalAgent>,
  settings: AiAssistantSettings,
) => {
  const agentModelPreference = localAgentPreferencesOf(
    settings,
    agent?.info.id,
  ).model
  return {
    agentModelPreference,
    agentModel: agent && effectiveAgentModel(agent, agentModelPreference),
    initialAgentModel: modelFromAgentConfig(
      agent?.initialModelConfig,
      agentModelPreference,
    ),
  }
}

export const queuedAgentModel = (
  agent: ReturnType<typeof useLocalAgent>,
  settings: AiAssistantSettings,
) => agentDestination(agent, settings).agentModel

// Where a message sent now goes. The composer and the queue dispatch must
// derive it the same way, or a queued message goes where it was not meant to.
export const sendDestination = (
  model: string | null,
  channel: QueuedEntry["channel"],
  agent: ReturnType<typeof useLocalAgent>,
  settings: AiAssistantSettings,
) => {
  const agentChannel = model === LOCAL_AGENT_MODEL ? channel : null
  const agentSnapshot = agentChannel ? agent : null
  return {
    model,
    channel: agentChannel,
    acceptsImages: agentSnapshot?.acceptsImages === true,
    ...agentDestination(agentSnapshot, settings),
  }
}

type SendDestination = ReturnType<typeof sendDestination>

export const matchesQueuedDestination = (
  entry: QueuedEntry,
  destination: SendDestination,
) =>
  entry.model === destination.model &&
  (destination.model !== LOCAL_AGENT_MODEL ||
    (destination.channel !== null &&
      entry.channel === destination.channel &&
      entry.agentModelPreference === destination.agentModelPreference &&
      (entry.awaitingInitialAgentModel
        ? destination.initialAgentModel
        : entry.agentModel) === destination.agentModel)) &&
  (entry.images.length === 0 || destination.acceptsImages)

export const wasQueueCancelled = (entry: QueuedEntry) =>
  entry.waitingFor?.aborted === true &&
  entry.waitingFor.reason !== STEERED_ABORT_REASON

const ContextBadgeContainer = styled.div`
  position: absolute;
  padding: 0.8rem;
  top: 2px;
  border-radius: 0.6rem;
  left: 1px;
  width: calc(100% - 0.2rem);
  display: inline-flex;
`

const ContextBadge = styled(Button).attrs<{ $warn?: boolean }>((props) => ({
  variant: props.$warn ? "dangerGhost" : "tertiary",
}))<{ $warn?: boolean }>`
  display: flex;
  padding: 0.3rem 0.6rem;
  align-items: center;
  gap: 0.4rem;
  line-height: 1.4;
  border-radius: 0.6rem;
  font-size: 1.3rem;
  user-select: none;
  height: unset;
`

const ContextBadgeIcon = styled.div<{ $warn?: boolean }>`
  display: flex;
  align-items: center;
  color: ${color("contentSecondary")};
  flex-shrink: 0;

  svg {
    color: ${({ $warn, theme }) =>
      $warn ? theme.color.statusDanger : color("contentSecondary")};
  }
`

export type NotebookContext = {
  label: string
  warn?: "archived" | "deleted" | null
  onClick: () => void | Promise<void>
}

type ChatInputProps = {
  conversationId: string | null
  queue: ChatQueue
  setQueue: (update: (current: ChatQueue) => ChatQueue) => boolean
  // The token usage of the chat's latest answer, shown beside the settings.
  contextUsage?: ContextUsage | null
  chatTokens?: TokenUsageCounts | null
  // What a console command, like /model, did, for the chat to show.
  onCommandNote?: (note: {
    command: string
    text: string
    error: boolean
  }) => void
  disabled?: boolean
  localAgentTransportReady?: boolean
  questionDrafts?: QuestionDrafts
  placeholder?: string
  contextSQL?: string
  contextTableId?: number
  contextNotebook?: NotebookContext
  onContextClick: () => void
}

const truncateText = (text: string, maxLength: number = 30): string => {
  if (!text) return ""
  const trimmed = text.trim().replace(/\s+/g, " ")
  if (trimmed.length <= maxLength) return trimmed
  return trimmed.slice(0, maxLength) + "..."
}

export type ChatInputHandle = {
  focus: () => void
}

// A conversation change replaces the full unsent draft, including pending reads.
export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  (props, ref) => (
    <ConversationInput key={props.conversationId} {...props} ref={ref} />
  ),
)

const ConversationInput = forwardRef<ChatInputHandle, ChatInputProps>(
  (
    {
      conversationId,
      queue,
      setQueue,
      contextUsage = null,
      chatTokens = null,
      onCommandNote,
      disabled = false,
      localAgentTransportReady = false,
      questionDrafts,
      placeholder = "Ask a question or request a refinement...",
      contextSQL,
      contextTableId,
      contextNotebook,
      onContextClick,
    },
    ref,
  ) => {
    const [input, setInput] = useState("")
    const inputContainerRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const restoreFocusAfterAnswer = useRef(false)
    const tables = useSelector(selectors.query.getTables)

    const tableData = useMemo(() => {
      if (contextTableId == null) return null
      return tables.find((t) => t.id === contextTableId) ?? null
    }, [contextTableId, tables])

    // Notebook context wins over table/SQL when the chat is bound; bound chats never carry SQL context.
    const contextText = contextNotebook
      ? truncateText(contextNotebook.label)
      : tableData?.table_name
        ? truncateText(tableData.table_name)
        : contextSQL
          ? truncateText(contextSQL)
          : null
    const hasContext = Boolean(contextText)
    const notebookWarn = contextNotebook?.warn
    const notebookBadgeTitle = contextNotebook
      ? notebookWarn === "archived"
        ? `Notebook archived`
        : notebookWarn === "deleted"
          ? `Notebook deleted`
          : `Attached: ${contextNotebook.label} — click to switch`
      : undefined

    useImperativeHandle(ref, () => ({
      focus: () => {
        textareaRef.current?.focus()
      },
    }))
    const {
      status: aiStatus,
      getOperationSignal,
      abortOperation,
      steerOperation,
      currentModel,
      aiAssistantSettings,
    } = useAIStatus()

    const isAIInProgress = isBlockingAIStatus(aiStatus)
    const queued = conversationId ? queue[conversationId] : undefined
    // Images attached to the message being written.
    const [attachments, setAttachments] = useState<AgentPromptImage[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)
    const readingAttachment = useRef(false)
    const [isReadingAttachment, setIsReadingAttachment] = useState(false)
    const [isComposerFocused, setIsComposerFocused] = useState(false)
    const mounted = useRef(false)
    useLayoutEffect(() => {
      mounted.current = true
      return () => {
        mounted.current = false
      }
    }, [])

    const localAgent = useLocalAgent()
    const localAgentChannel = useLocalAgentChannel()
    const composerModel = useComposerModel()
    const destination = sendDestination(
      currentModel,
      localAgentChannel,
      localAgent,
      aiAssistantSettings,
    )
    const { acceptsImages } = destination

    const unqueue = useCallback(
      (id: string, entry: QueuedEntry) =>
        setQueue((current) => {
          if (current[id] !== entry) return current
          const { [id]: _removed, ...rest } = current
          return rest
        }),
      [setQueue],
    )

    const matchesDestination = (entry: QueuedEntry) =>
      matchesQueuedDestination(entry, destination)
    const queueMismatch = queued !== undefined && !matchesDestination(queued)
    const waitingForBridge =
      currentModel === LOCAL_AGENT_MODEL && !localAgentTransportReady
    const queueHeld =
      queued?.heldByStop ||
      (queued?.agentCommand === true && wasQueueCancelled(queued))
    const draftOccupiesComposer = input !== "" || attachments.length > 0
    const queueEditHint = !queued
      ? undefined
      : isReadingAttachment
        ? "Wait for the draft images to finish loading before choosing Edit."
        : queued.agentCommand && draftOccupiesComposer
          ? "Clear the draft text and remove any draft images, then choose Edit again to restore the queued command."
          : exceedsImageLimit(queued.images.length + attachments.length)
            ? `Remove draft images before editing; a message can contain up to ${MAX_IMAGES} images.`
            : undefined

    useEffect(() => {
      // Preserve the existing recovery for a cancelled turn. A mismatched
      // destination stays queued until the user acts or it matches again.
      if (
        isAIInProgress ||
        disabled ||
        queueMismatch ||
        !conversationId ||
        !queued ||
        queued.agentCommand ||
        queueHeld ||
        queueEditHint ||
        readingAttachment.current ||
        !wasQueueCancelled(queued) ||
        !unqueue(conversationId, queued)
      )
        return
      setInput((current) => [queued.text, current].filter(Boolean).join("\n\n"))
      setAttachments((current) => [...queued.images, ...current])
    }, [
      isAIInProgress,
      disabled,
      queueMismatch,
      conversationId,
      queued,
      queueHeld,
      queueEditHint,
      unqueue,
    ])

    useEffect(() => {
      // Auto-resize textarea
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto"
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
      }
    }, [input])

    const clearInput = () => {
      setInput("")
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto"
      }
    }

    const commandListId = useId()
    const [highlighted, setHighlighted] = useState(0)
    // The input at which the user closed the menu; typing reopens it.
    const [dismissedAt, setDismissedAt] = useState<string | null>(null)
    // Why an image could not be attached.
    const [attachError, setAttachError] = useState<string | null>(null)
    const [pickerRequest, setPickerRequest] = useState<PickerRequest | null>(
      null,
    )
    const agentCommands = composerModel.usesAgent
      ? (localAgent?.commands ?? [])
      : null
    const commands = useMemo(
      () =>
        availableCommands(agentCommands ?? [], composerModel.effort !== null),
      [agentCommands, composerModel.effort],
    )
    // /effort runs in the console even for a model without effort, which the
    // menu leaves it out for: it says so rather than reaching the model.
    const runnableCommands = useMemo(
      () => availableCommands(agentCommands ?? [], true),
      [agentCommands],
    )
    const commandQuery = typedCommandQuery(input)
    // The argument a command just added takes, until the user types it.
    const awaitedArgument = (() => {
      if (!/\s$/.test(input)) return null
      const parsed = parseCommand(input, commands)
      return parsed && !parsed.args && parsed.command.hint
        ? parsed.command
        : null
    })()
    const menuCommands =
      commandQuery !== null && dismissedAt !== input
        ? matchingCommands(commands, commandQuery)
        : []
    const menuOpen = menuCommands.length > 0
    const activeCommand = Math.min(highlighted, menuCommands.length - 1)

    const changeInput = (value: string) => {
      setInput(value)
      setAttachError(null)
      setHighlighted(0)
    }

    // /model and /effort run in the console: without a name they open the
    // picker, with one they pick it. What they did shows in the chat; after
    // an error the message stays, to be fixed. True when handled.
    const runConsoleCommand = (command: SlashCommand, args: string) => {
      if (command.source !== "console") return false
      const typed = `/${command.name}${args ? ` ${args}` : ""}`
      const noteError = (text: string) =>
        onCommandNote?.({ command: typed, text, error: true })
      const noteDone = (text: string) =>
        onCommandNote?.({ command: typed, text, error: false })
      if (isAIInProgress) {
        noteError(
          `Wait for the answer to finish to change the ${command.name}.`,
        )
        return true
      }
      const picker = command.name === "effort" ? "effort" : "model"
      if (!args) {
        if (picker === "effort" && !composerModel.effort) {
          noteError("This model has no effort setting.")
          return true
        }
        setPickerRequest({ picker, nonce: Date.now() })
        clearInput()
        return true
      }
      if (picker === "model") {
        const found = resolveModel(composerModel.groups, args)
        if (!found.ok) {
          noteError(found.error)
          return true
        }
        composerModel.selectModel(found.value.selection)
        const group = composerModel.groups.find((candidate) =>
          candidate.options.includes(found.value),
        )
        clearInput()
        noteDone(
          `Model set to ${found.value.label}${
            group && group.provider === null ? ` · ${group.label}` : ""
          }`,
        )
        return true
      }
      const found = resolveEffort(composerModel.effort, args)
      if (!found.ok) {
        noteError(found.error)
        return true
      }
      composerModel.selectEffort(found.value.value)
      clearInput()
      noteDone(`Effort set to ${found.value.label}`)
      return true
    }

    const sendText = (
      text: string,
      images: AgentPromptImage[] = [],
      agentCommand = false,
    ) => {
      if (!conversationId || disabled || readingAttachment.current) return false
      if (images.length > 0 && !acceptsImages) {
        setAttachError(
          "Change to an agent that reads images, or remove the attachments.",
        )
        return false
      }
      let error: string | null = null
      const submitted = setQueue((current) => {
        const previous = current[conversationId]
        if (previous?.heldByStop && !previous.agentCommand) {
          error = "Edit or remove the held queued message before sending."
          return current
        }
        if (previous && !matchesDestination(previous)) {
          error =
            "Restore the queued message’s destination, or edit or remove it first."
          return current
        }
        if (previous && (agentCommand || previous.agentCommand)) {
          error =
            previous.agentCommand &&
            (previous.heldByStop || wasQueueCancelled(previous))
              ? "Agent commands must send separately. Edit or remove the held command first."
              : "Agent commands must send separately. Wait for the queued message to send, or edit it first."
          return current
        }
        if (exceedsImageLimit((previous?.images.length ?? 0) + images.length)) {
          error = `A message takes up to ${MAX_IMAGES} images. Remove an image or wait for the queued message to send.`
          return current
        }
        return {
          ...current,
          [conversationId]: previous
            ? {
                ...previous,
                text: [previous.text, text].filter(Boolean).join("\n\n"),
                images: [...previous.images, ...images],
              }
            : {
                text,
                images,
                agentCommand,
                model: destination.model,
                channel: destination.channel,
                agentModel: destination.agentModel,
                agentModelPreference: destination.agentModelPreference,
                awaitingInitialAgentModel:
                  destination.agentModel === null &&
                  destination.initialAgentModel === null,
                waitingFor: isAIInProgress ? getOperationSignal() : undefined,
              },
        }
      })
      if (!submitted) {
        setAttachError(error)
        return false
      }
      setAttachError(null)
      clearInput()
      setAttachments([])
      return true
    }

    const hasImageRoom = attachments.length < MAX_IMAGES
    const takesImagesNow = () =>
      acceptsImages && hasImageRoom && !readingAttachment.current

    // An agent that reads images takes them pasted, dropped or picked.
    const attach = async (files: File[]) => {
      if (files.length === 0) return
      if (!acceptsImages) {
        setAttachError(
          composerModel.usesAgent
            ? `${localAgent?.info.label ?? "This agent"} does not read images.`
            : "Images work with agents that read them.",
        )
        return
      }
      if (readingAttachment.current) {
        setAttachError(
          "Wait for the current image attachments to finish reading.",
        )
        return
      }
      readingAttachment.current = true
      setIsReadingAttachment(true)
      try {
        const { images, error } = await readImages(
          files,
          MAX_IMAGES - attachments.length,
        )
        if (!mounted.current) return
        setAttachments((current) => [...current, ...images])
        setAttachError(error)
        textareaRef.current?.focus()
      } catch {
        if (mounted.current)
          setAttachError("Could not read the image attachments.")
      } finally {
        readingAttachment.current = false
        if (mounted.current) setIsReadingAttachment(false)
      }
    }
    const imageFilesOf = (items: DataTransferItemList | null) =>
      Array.from(items ?? [])
        .filter(
          (item) => item.kind === "file" && item.type.startsWith("image/"),
        )
        .flatMap((item) => {
          const file = item.getAsFile()
          return file ? [file] : []
        })

    // A command picked from the menu runs as it is; an agent's goes to the
    // agent as the message.
    // One that takes an argument waits for it: Enter adds the command, and
    // the next Enter sends it.
    const chooseCommand = (command: SlashCommand) => {
      if (readingAttachment.current) return
      if (runConsoleCommand(command, "")) return
      if (command.hint) return completeCommand(command)
      const text = `/${command.name}`
      if (!sendText(text, attachments, true) && queued) {
        // Keep the chosen command as a draft, without submitting it as text.
        setInput(text)
        setDismissedAt(text)
      }
    }

    const completeCommand = (command: SlashCommand) => {
      changeInput(`/${command.name} `)
      textareaRef.current?.focus()
    }

    const handleSend = () => {
      if (readingAttachment.current) return false
      const trimmed = input.trim()
      if ((!trimmed && attachments.length === 0) || disabled || !conversationId)
        return false
      const parsed = parseCommand(trimmed, runnableCommands)
      if (parsed && runConsoleCommand(parsed.command, parsed.args)) return false
      return sendText(trimmed, attachments, parsed?.command.source === "agent")
    }

    // Takes the queued message back into the input for editing.
    const editQueued = () => {
      if (!conversationId || !queued) return
      if (queueEditHint || readingAttachment.current) return
      if (!unqueue(conversationId, queued)) return
      setInput((current) =>
        current ? `${queued.text}\n\n${current}` : queued.text,
      )
      setAttachments((current) => [...queued.images, ...current])
      textareaRef.current?.focus()
    }

    // Cmd/Ctrl+Enter replaces the running answer with what the user wrote,
    // or else with the queued message. With no answer running, it sends.
    const steer = () => {
      if (readingAttachment.current) return
      const hasDraft = input.trim() !== "" || attachments.length > 0
      const submitted = handleSend()
      if ((submitted || (!hasDraft && queued)) && isAIInProgress) {
        sendQueuedNow()
      }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isImeKeyEvent(e)) return
      if (menuOpen) {
        const move = (by: number) => {
          e.preventDefault()
          setHighlighted(
            (activeCommand + by + menuCommands.length) % menuCommands.length,
          )
        }
        if (e.key === "ArrowDown") return move(1)
        if (e.key === "ArrowUp") return move(-1)
        if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
          e.preventDefault()
          return chooseCommand(menuCommands[activeCommand])
        }
        if (e.key === "Tab" && !e.shiftKey) {
          e.preventDefault()
          return completeCommand(menuCommands[activeCommand])
        }
        if (e.key === "Escape") {
          e.preventDefault()
          e.stopPropagation()
          return setDismissedAt(input)
        }
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        // The editor accepts a pending diff with the same keys.
        e.stopPropagation()
        steer()
      } else if (e.key === "Enter" && !e.shiftKey) {
        // Enter without Shift -> send message
        e.preventDefault()
        handleSend()
      } else if (e.key === "ArrowUp" && queued && input === "") {
        e.preventDefault()
        editQueued()
      }
      // Shift+Enter -> allow default behavior (new line)
    }

    const handleStop = () => {
      if (
        conversationId &&
        queued &&
        (queued.agentCommand ||
          queueHeld ||
          queueMismatch ||
          queueEditHint ||
          readingAttachment.current)
      ) {
        // Preserve the destination and both buffers until the user chooses Edit or Remove.
        setQueue((current) =>
          current[conversationId] === queued && !queued.heldByStop
            ? { ...current, [conversationId]: { ...queued, heldByStop: true } }
            : current,
        )
      } else {
        editQueued()
      }
      abortOperation()
    }

    // Stops the answer; the queued message goes out once it has stopped.
    const sendQueuedNow = () => {
      if (
        !disabled &&
        !queueMismatch &&
        !readingAttachment.current &&
        (!queued || (!queued.heldByStop && !wasQueueCancelled(queued))) &&
        (currentModel !== LOCAL_AGENT_MODEL ||
          destination.channel?.isTransportReady())
      )
        steerOperation()
    }

    const hasDraft = input.trim() !== "" || attachments.length > 0
    const showSend = !isAIInProgress || hasDraft
    const showBoth = isAIInProgress && showSend
    const question = localAgent?.questions.find(
      (pending) => pending.conversationId === conversationId,
    )

    const handleQuestionAnswer = (
      answers: Record<string, string | string[]> | null,
    ) => {
      if (!question || !localAgentChannel) return false
      restoreFocusAfterAnswer.current =
        inputContainerRef.current?.contains(document.activeElement) ?? false
      const sent = localAgentChannel.answerQuestion(question.requestId, answers)
      if (!sent) restoreFocusAfterAnswer.current = false
      return sent
    }

    // Stop removes the card too: return focus as an answer would.
    const handleQuestionStop = () => {
      restoreFocusAfterAnswer.current =
        inputContainerRef.current?.contains(document.activeElement) ?? false
      handleStop()
    }

    useLayoutEffect(() => {
      // A next question focuses itself. Only fill a focus gap left by the
      // last card, never override another control the user moved to.
      if (
        restoreFocusAfterAnswer.current &&
        document.activeElement === document.body
      ) {
        textareaRef.current?.focus()
      }
      restoreFocusAfterAnswer.current = false
    }, [question?.requestId])

    return (
      <InputContainer ref={inputContainerRef} $hasQuestion={Boolean(question)}>
        {question?.url != null && localAgent ? (
          <LinkRequestCard
            key={question.requestId}
            agentLabel={localAgent.info.label}
            question={{ ...question, url: question.url }}
            onAnswer={handleQuestionAnswer}
            onStop={handleQuestionStop}
          />
        ) : question && localAgent ? (
          <QuestionCard
            key={question.requestId}
            agentLabel={localAgent.info.label}
            question={question}
            drafts={questionDrafts}
            interruptsTyping={isComposerFocused}
            onAnswer={handleQuestionAnswer}
            onStop={handleQuestionStop}
          />
        ) : (
          <>
            {queued && (
              <QueuedMessage
                text={queued.text}
                imageCount={queued.images.length}
                onSendNow={
                  isAIInProgress && !queueHeld ? sendQueuedNow : undefined
                }
                sendNowDisabled={
                  disabled ||
                  queueMismatch ||
                  waitingForBridge ||
                  isReadingAttachment ||
                  wasQueueCancelled(queued)
                }
                blockedReason={
                  queueEditHint ??
                  (queueHeld
                    ? `${queued.agentCommand ? "Command" : "Queued message"} held. Choose Edit to restore it, or remove it.`
                    : queueMismatch
                      ? "Restore the original destination or edit the queued message."
                      : waitingForBridge
                        ? `Waiting for ${localAgentChannel?.info.label ?? "your agent"}.`
                        : undefined)
                }
                editDisabled={Boolean(queueEditHint)}
                onEdit={editQueued}
                onRemove={() =>
                  conversationId && unqueue(conversationId, queued)
                }
              />
            )}
            <ComposerField
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes("Files"))
                  event.preventDefault()
              }}
              onDrop={(event) => {
                const files = imageFilesOf(event.dataTransfer.items)
                if (files.length === 0) return
                event.preventDefault()
                void attach(files)
              }}
            >
              {menuOpen && (
                <SlashCommandMenu
                  id={commandListId}
                  commands={menuCommands}
                  highlighted={activeCommand}
                  onHighlight={setHighlighted}
                  onChoose={chooseCommand}
                />
              )}
              {!menuOpen && awaitedArgument && (
                <CommandArgumentHint command={awaitedArgument} />
              )}
              <InputWrapper>
                {hasContext && (
                  <ContextBadgeContainer>
                    <ContextBadge
                      type="button"
                      $warn={Boolean(notebookWarn)}
                      onClick={
                        contextNotebook
                          ? () => void contextNotebook.onClick()
                          : onContextClick
                      }
                      title={notebookBadgeTitle}
                      aria-label={`Chat context: ${contextText}`}
                      data-hook="chat-context-badge"
                    >
                      <ContextBadgeIcon $warn={Boolean(notebookWarn)}>
                        {contextNotebook ? (
                          <NotebookIcon size={14} weight="regular" />
                        ) : tableData ? (
                          <TableIcon
                            kind={getTableKind(tableData)}
                            partitionBy={tableData.partitionBy}
                            walEnabled={tableData.walEnabled}
                            designatedTimestamp={tableData.designatedTimestamp}
                          />
                        ) : (
                          <CodeBlockIcon size={14} weight="regular" />
                        )}
                      </ContextBadgeIcon>
                      {notebookWarn === "archived"
                        ? `Archived: ${contextText}`
                        : notebookWarn === "deleted"
                          ? `Deleted: ${contextText}`
                          : contextText}
                    </ContextBadge>
                  </ContextBadgeContainer>
                )}
                {attachments.length > 0 && (
                  <ComposerAttachments $top={hasContext ? "4.4rem" : "1.2rem"}>
                    <ImageAttachments
                      images={attachments}
                      size={ATTACHMENT_SIZE}
                      onRemove={(index) =>
                        setAttachments((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                    />
                  </ComposerAttachments>
                )}
                <StyledTextArea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => changeInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setIsComposerFocused(true)}
                  onBlur={() => setIsComposerFocused(false)}
                  onPaste={(event) => {
                    const files = imageFilesOf(event.clipboardData.items)
                    if (files.length === 0) return
                    // Text pastes as usual when its images cannot be taken.
                    if (
                      !takesImagesNow() &&
                      event.clipboardData.getData("text/plain")
                    )
                      return
                    event.preventDefault()
                    void attach(files)
                  }}
                  placeholder={
                    isAIInProgress
                      ? "Queue a follow-up message..."
                      : placeholder
                  }
                  aria-label="Chat with AI assistant"
                  aria-keyshortcuts="Enter"
                  aria-autocomplete="list"
                  aria-expanded={menuOpen}
                  aria-controls={menuOpen ? commandListId : undefined}
                  aria-activedescendant={
                    menuOpen
                      ? commandOptionId(commandListId, activeCommand)
                      : undefined
                  }
                  disabled={disabled}
                  rows={1}
                  $paddingTop={`${(hasContext ? 4.4 : 1.2) + (attachments.length > 0 ? ATTACHMENT_SIZE + 0.8 : 0)}rem`}
                  $paddingRight={`${4.5 + (acceptsImages ? 4 : 0) + (showBoth ? 4 : 0)}rem`}
                  data-hook="chat-input-textarea"
                />
                {acceptsImages && (
                  <>
                    <AttachButton
                      label="Attach images"
                      tooltip="Attach images, or paste or drop them"
                      variant="ghost"
                      onClick={() => fileInputRef.current?.click()}
                      $alongsideStop={showBoth}
                      disabled={
                        disabled || isReadingAttachment || !hasImageRoom
                      }
                      data-hook="chat-attach-image"
                    >
                      <ImageIcon size={18} />
                    </AttachButton>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={IMAGE_TYPES.join(",")}
                      multiple
                      hidden
                      onChange={(event) => {
                        void attach(Array.from(event.target.files ?? []))
                        event.target.value = ""
                      }}
                      data-hook="chat-attach-image-input"
                    />
                  </>
                )}
                {isAIInProgress && (
                  <StopButton
                    $alongsideSend={showBoth}
                    label="Stop AI generation"
                    variant="secondary"
                    onClick={handleStop}
                    title="Stop generation"
                    data-hook="chat-stop-button"
                  >
                    <StopIcon size={14} weight="fill" />
                  </StopButton>
                )}
                {showSend && (
                  <SendButton
                    label={isAIInProgress ? "Queue message" : "Send message"}
                    variant="primary"
                    onClick={handleSend}
                    disabled={!hasDraft || disabled || isReadingAttachment}
                    title={
                      isAIInProgress
                        ? `Queue (Enter) • Send now, stopping the answer (${ctrlCmd}+Enter)`
                        : "Send (Enter) • New line (Shift+Enter)"
                    }
                    data-hook="chat-send-button"
                  >
                    <ArrowUpIcon size={20} weight="bold" />
                  </SendButton>
                )}
              </InputWrapper>
            </ComposerField>
            {attachError && (
              <AttachError role="alert" data-hook="chat-attach-error">
                {attachError}
              </AttachError>
            )}
          </>
        )}
        <ComposerControls
          disabled={isAIInProgress}
          contextUsage={contextUsage}
          chatTokens={chatTokens}
          pickerRequest={pickerRequest}
          onPicked={() => textareaRef.current?.focus()}
        />
      </InputContainer>
    )
  },
)
