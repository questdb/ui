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
import { QuestionCard } from "./QuestionCard"
import { LinkRequestCard } from "./LinkRequestCard"
import {
  IMAGE_TYPES,
  ImageAttachments,
  MAX_IMAGES,
  readImages,
} from "./ImageAttachments"
import type { AgentPromptImage } from "../../../utils/localAgent/protocol"
import {
  effectiveAgentModel,
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

const InputContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.8rem;
  padding: 1rem 1.2rem;
  flex-shrink: 0;
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
  waitingFor?: AbortSignal
}

export type ChatQueue = Record<string, QueuedEntry>

export const queuedAgentModel = (
  agent: ReturnType<typeof useLocalAgent>,
  settings: AiAssistantSettings,
) =>
  agent &&
  effectiveAgentModel(
    agent,
    localAgentPreferencesOf(settings, agent.info.id).model,
  )

export const matchesQueuedDestination = (
  entry: QueuedEntry,
  model: string | null,
  channel: QueuedEntry["channel"],
  acceptsImages: boolean,
  agentModel: string | null,
) =>
  entry.model === model &&
  (model !== LOCAL_AGENT_MODEL ||
    (channel !== null &&
      entry.channel === channel &&
      entry.agentModel === agentModel)) &&
  (entry.images.length === 0 || acceptsImages)

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
      placeholder = "Ask a question or request a refinement...",
      contextSQL,
      contextTableId,
      contextNotebook,
      onContextClick,
    },
    ref,
  ) => {
    const [input, setInput] = useState("")
    const textareaRef = useRef<HTMLTextAreaElement>(null)
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
    const destinationChannel =
      currentModel === LOCAL_AGENT_MODEL ? localAgentChannel : null
    const agentModel = destinationChannel
      ? queuedAgentModel(localAgent, aiAssistantSettings)
      : null
    const acceptsImages =
      composerModel.usesAgent && localAgent?.acceptsImages === true

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
      matchesQueuedDestination(
        entry,
        currentModel,
        destinationChannel,
        acceptsImages,
        agentModel,
      )
    const queueMismatch = queued !== undefined && !matchesDestination(queued)
    const waitingForBridge =
      currentModel === LOCAL_AGENT_MODEL && !localAgentTransportReady

    useEffect(() => {
      // Preserve the existing recovery for a cancelled turn. A mismatched
      // destination stays queued until the user acts or it matches again.
      if (
        isAIInProgress ||
        disabled ||
        queueMismatch ||
        !conversationId ||
        !queued ||
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
        if (previous && !matchesDestination(previous)) {
          error =
            "Restore the queued message’s destination, or edit or remove it first."
          return current
        }
        if (previous && (agentCommand || previous.agentCommand)) {
          error =
            "Agent commands must send separately. Wait for the queued message to send, or edit it first."
          return current
        }
        if ((previous?.images.length ?? 0) + images.length > MAX_IMAGES) {
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
                model: currentModel,
                channel: destinationChannel,
                agentModel,
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

    // An agent that reads images takes them pasted, dropped or picked.
    const attach = async (files: File[]) => {
      if (files.length === 0) return
      if (!acceptsImages) {
        setAttachError(
          composerModel.usesAgent
            ? `${localAgent?.info.label ?? "This agent"} does not read images.`
            : "Images work with local agents that read them.",
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
      if (e.nativeEvent.isComposing) return
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

    // Stopping keeps the queued message, in the input, for the user to edit.
    const handleStop = () => {
      editQueued()
      abortOperation()
    }

    // Stops the answer; the queued message goes out once it has stopped.
    const sendQueuedNow = () => {
      if (
        !disabled &&
        !queueMismatch &&
        !readingAttachment.current &&
        (!queued || !wasQueueCancelled(queued)) &&
        (currentModel !== LOCAL_AGENT_MODEL ||
          destinationChannel?.isTransportReady())
      )
        steerOperation()
    }

    const hasDraft = input.trim() !== "" || attachments.length > 0
    const showSend = !isAIInProgress || hasDraft
    const showBoth = isAIInProgress && showSend
    const question = localAgent?.questions.find(
      (pending) => pending.conversationId === conversationId,
    )

    return (
      <InputContainer>
        {question?.url && localAgent ? (
          <LinkRequestCard
            key={question.requestId}
            agentLabel={localAgent.info.label}
            question={{ ...question, url: question.url }}
            onAnswer={(answers) =>
              localAgentChannel?.answerQuestion(question.requestId, answers) ??
              false
            }
            onStop={handleStop}
          />
        ) : question && localAgent ? (
          <QuestionCard
            key={question.requestId}
            agentLabel={localAgent.info.label}
            question={question}
            onAnswer={(answers) =>
              localAgentChannel?.answerQuestion(question.requestId, answers) ??
              false
            }
            onStop={handleStop}
          />
        ) : (
          <>
            {queued && (
              <QueuedMessage
                text={queued.text}
                imageCount={queued.images.length}
                onSendNow={isAIInProgress ? sendQueuedNow : undefined}
                sendNowDisabled={
                  disabled ||
                  queueMismatch ||
                  waitingForBridge ||
                  isReadingAttachment ||
                  wasQueueCancelled(queued)
                }
                blockedReason={
                  queueMismatch
                    ? "Restore the original destination or edit the queued message."
                    : waitingForBridge
                      ? "Waiting for the local agent bridge."
                      : undefined
                }
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
                  onPaste={(event) => {
                    const files = imageFilesOf(event.clipboardData.items)
                    if (files.length === 0) return
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
                        disabled ||
                        isReadingAttachment ||
                        attachments.length >= MAX_IMAGES
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
