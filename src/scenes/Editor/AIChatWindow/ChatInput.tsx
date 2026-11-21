import type { ContextUsage } from "../../../utils/ai/aiAssistant"
import React, {
  useState,
  useRef,
  useEffect,
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

const AttachButton = styled(IconButton)`
  position: absolute;
  right: 4.8rem;
  bottom: 0.8rem;
`

// A message waiting for the answer to end, with the images attached to it.
type QueuedEntry = {
  text: string
  images: AgentPromptImage[]
  agentCommand: boolean
  model: string | null
}

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
  // The token usage of the chat's latest answer, shown beside the settings.
  contextUsage?: ContextUsage | null
  chatTokens?: TokenUsageCounts | null
  // What a console command, like /model, did, for the chat to show.
  onCommandNote?: (note: {
    command: string
    text: string
    error: boolean
  }) => void
  // agentCommand: the message is one of the agent's commands, like /review.
  onSend: (
    message: string,
    images: AgentPromptImage[],
    agentCommand: boolean,
  ) => void
  disabled?: boolean
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

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  (
    {
      conversationId,
      contextUsage = null,
      chatTokens = null,
      onCommandNote,
      onSend,
      disabled = false,
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
      abortOperation,
      steerOperation,
      currentModel,
    } = useAIStatus()

    const isAIInProgress = isBlockingAIStatus(aiStatus)
    // Messages written while the assistant answers, per conversation. Each
    // is sent when the answer ends, unless the user stops it.
    const [queue, setQueue] = useState<Record<string, QueuedEntry>>({})
    const queued = conversationId ? queue[conversationId] : undefined
    // Images attached to the message being written.
    const [attachments, setAttachments] = useState<AgentPromptImage[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    const unqueue = (id: string) =>
      setQueue(({ [id]: _removed, ...rest }) => rest)

    useEffect(() => {
      if (isAIInProgress || disabled || !conversationId) return
      const entry = queue[conversationId]
      if (!entry) return
      unqueue(conversationId)
      if (entry.model !== currentModel) {
        setInput((current) =>
          [entry.text, current].filter(Boolean).join("\n\n"),
        )
        setAttachments((current) => [...entry.images, ...current])
        return
      }
      onSend(entry.text, entry.images, entry.agentCommand)
    }, [isAIInProgress, disabled, conversationId, currentModel, queue, onSend])

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

    const localAgent = useLocalAgent()
    const localAgentChannel = useLocalAgentChannel()
    const composerModel = useComposerModel()
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
      if (!conversationId) return
      if (isAIInProgress || queued) {
        setQueue((current) => {
          const previous = current[conversationId]
          return {
            ...current,
            [conversationId]: previous
              ? {
                  text: [previous.text, text].filter(Boolean).join("\n\n"),
                  images: [...previous.images, ...images],
                  // Joined to another message, a command is no longer one.
                  agentCommand: false,
                  model: previous.model,
                }
              : { text, images, agentCommand, model: currentModel },
          }
        })
      } else {
        onSend(text, images, agentCommand)
      }
      clearInput()
      setAttachments([])
    }

    // An agent that reads images takes them pasted, dropped or picked.
    const acceptsImages =
      composerModel.usesAgent && localAgent?.acceptsImages === true
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
      const { images, error } = await readImages(
        files,
        MAX_IMAGES - attachments.length,
      )
      setAttachments((current) => [...current, ...images])
      setAttachError(error)
      textareaRef.current?.focus()
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
      if (runConsoleCommand(command, "")) return
      if (command.hint) return completeCommand(command)
      sendText(`/${command.name}`, attachments, true)
    }

    const completeCommand = (command: SlashCommand) => {
      changeInput(`/${command.name} `)
      textareaRef.current?.focus()
    }

    const handleSend = () => {
      const trimmed = input.trim()
      if ((!trimmed && attachments.length === 0) || disabled || !conversationId)
        return
      const parsed = parseCommand(trimmed, runnableCommands)
      if (parsed && runConsoleCommand(parsed.command, parsed.args)) return
      sendText(trimmed, attachments, parsed?.command.source === "agent")
    }

    // Takes the queued message back into the input for editing.
    const editQueued = () => {
      if (!conversationId || !queued) return
      unqueue(conversationId)
      setInput((current) =>
        current ? `${queued.text}\n\n${current}` : queued.text,
      )
      setAttachments((current) => [...queued.images, ...current])
      textareaRef.current?.focus()
    }

    // Cmd/Ctrl+Enter replaces the running answer with what the user wrote,
    // or else with the queued message. With no answer running, it sends.
    const steer = () => {
      const hasInput = input.trim() !== ""
      handleSend()
      if (isAIInProgress && (hasInput || queued)) steerOperation()
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
    const sendQueuedNow = () => steerOperation()

    const showStop = isAIInProgress && input.trim() === ""
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
                onSendNow={sendQueuedNow}
                onRemove={() => conversationId && unqueue(conversationId)}
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
                  $paddingRight={acceptsImages ? "8.5rem" : "4.5rem"}
                  data-hook="chat-input-textarea"
                />
                {acceptsImages && (
                  <>
                    <AttachButton
                      label="Attach images"
                      tooltip="Attach images, or paste or drop them"
                      variant="ghost"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={disabled || attachments.length >= MAX_IMAGES}
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
                {showStop ? (
                  <SendButton
                    label="Stop AI generation"
                    variant="secondary"
                    onClick={handleStop}
                    title="Stop generation"
                    data-hook="chat-stop-button"
                  >
                    <StopIcon size={14} weight="fill" />
                  </SendButton>
                ) : (
                  <SendButton
                    label={isAIInProgress ? "Queue message" : "Send message"}
                    variant="primary"
                    onClick={handleSend}
                    disabled={
                      (!input.trim() && attachments.length === 0) || disabled
                    }
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
