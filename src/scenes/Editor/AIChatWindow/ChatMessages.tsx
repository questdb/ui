import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useState,
  useCallback,
} from "react"
import { useDispatch, useSelector } from "react-redux"
import { actions, selectors } from "../../../store"
import styled, { css, keyframes, useTheme } from "styled-components"
import { LiteEditor } from "../../../components/LiteEditor"
import { Box, Text, Button } from "../../../components"
import type { SchemaDisplayData } from "../../../providers/AIConversationProvider/types"
import { color, getTableKind } from "../../../utils"
import type {
  ConversationMessage,
  UserMessageDisplayType,
} from "../../../providers/AIConversationProvider/types"
import { trimSemicolonForDisplay } from "../../../providers/AIConversationProvider/utils"
import { normalizeQueryText, createQueryKey } from "../Monaco/utils"
import {
  PlayIcon,
  ErrorIcon,
  SuccessIcon,
  LoadingIconSvg,
  ExpandUpDownIcon,
} from "../Monaco/icons"
import {
  CodeIcon,
  KeyReturnIcon,
  ChatDotsIcon,
  ArrowCounterClockwiseIcon,
  HammerIcon,
  FileSqlIcon,
  GradientIcon,
  StethoscopeIcon,
  XSquareIcon,
  WarningIcon,
} from "@phosphor-icons/react"
import { CloseCircle } from "@styled-icons/remix-fill"
import { CheckmarkOutline, CloseOutline } from "@styled-icons/evaicons-outline"
import { TableIcon } from "../../Schema/table-icon"
import { AssistantMessageContent } from "./AssistantMessageContent"
import type { QueryNotifications } from "../../../store/Query/types"
import { NotificationType, RunningType } from "../../../store/Query/types"
import type { QueryKey } from "../Monaco/utils"
import { useAIStatus } from "../../../providers/AIStatusProvider"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"
import {
  getScrollLength,
  projectConversationTurns,
} from "../../../utils/ai/turnView"

type QueryRunStatus = "neutral" | "loading" | "success" | "error"

const spinAnimation = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`

const LoadingIconWrapper = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ${spinAnimation} 3s linear infinite;
`

const LoadingIcon = () => (
  <LoadingIconWrapper>
    <LoadingIconSvg />
  </LoadingIconWrapper>
)

const MessagesContainer = styled(Box)<{ $scrolled: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 2rem 1rem;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  ${({ $scrolled }) =>
    !$scrolled &&
    css`
      opacity: 0;
    `}
`

const MessageBubble = styled(Box).attrs({ align: "flex-start" })`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.8rem;
  border-radius: 0.8rem;
  width: 100%;
  align-self: flex-end;
  background: ${color("loginBackground")};
  border: 1px solid rgba(25, 26, 33, 0.32);
  flex-shrink: 0;
`

const UserRequestBox = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.8rem;
  width: 100%;
  align-self: flex-end;
  background: ${color("loginBackground")};
  border: 1px solid rgba(25, 26, 33, 0.32);
  border-radius: 0.6rem;
  flex-shrink: 0;
`

const UserRequestHeader = styled(Box).attrs({
  alignItems: "center",
  gap: "0.8rem",
})`
  width: 100%;
  padding: 0.4rem;
  flex: 1 0 auto;
`

const UserRequestContent = styled(Box)`
  display: flex;
  flex-direction: column;
  border-radius: 0.6rem;
  overflow: hidden;
  flex-shrink: 0;
  width: 100%;
  align-items: flex-start;
`

const InlineSQLEditor = styled.div`
  width: 100%;
`

// Operation Badge components for fix/explain/generate/schema requests
const OperationBadge = styled(Box).attrs({
  gap: "1rem",
  alignItems: "center",
})`
  width: 100%;
  padding: 0 0.4rem;
`

const BadgeIconContainer = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  background: #290a13;
  border: 1px solid rgba(122, 31, 58, 0.64);
  border-radius: 0.4rem;
  padding: 0.8rem;
  width: 4.8rem;
  height: 4rem;
  flex-shrink: 0;
`

const BadgeIconWrapper = styled.div`
  width: 2.4rem;
  height: 2.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.pink};

  svg {
    width: 100%;
    height: 100%;
  }
`

const BadgeTitle = styled(Text)`
  font-weight: 500;
  font-size: 1.6rem;
  line-height: 1.6rem;
  color: ${color("foreground")};
`

const BadgeDescriptionContainer = styled(Box)`
  align-items: flex-start;
  flex-direction: column;
  padding: 0.8rem;
  width: 100%;
`

const BadgeDescriptionText = styled(Text)`
  font-size: 1.4rem;
  line-height: 2.1rem;
  color: ${color("foreground")};
`

const BadgeDescriptionIssueText = styled(Text)<{
  $severity?: "critical" | "warning"
}>`
  font-size: 1.4rem;
  line-height: 2.1rem;
  font-weight: 600;
`

const IssueMessageRow = styled(Box)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

const SchemaNameDisplay = styled(Button)`
  margin-left: 0.4rem;
  padding: 0.5rem 1rem;
  align-items: center;
  gap: 1rem;
  border-radius: 0.6rem;
  border: 1px solid ${color("selection")};
  background: ${color("backgroundDarker")};

  &:hover,
  &:active {
    background: ${color("backgroundLighter")} !important;
    border-color: ${color("cyan")} !important;
  }
`

const SchemaName = styled(Text)`
  font-size: 1.4rem;
  color: ${color("foreground")};
`

const MessageContent = styled(Text)`
  font-size: 1.4rem;
  line-height: 1.8rem;
  color: ${color("foreground")};
  white-space: pre-wrap;
  word-wrap: break-word;
`

const ExplanationBox = styled(Box)<{ $hasOperationHistory?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  width: 100%;
  align-self: flex-start;
  text-align: left;
  background: transparent;
  padding: 0.4rem;
  border-radius: 0.6rem;
  flex-shrink: 0;

  ${({ $hasOperationHistory }) =>
    $hasOperationHistory &&
    css`
      padding-top: 0;
    `}

  .assistant-label,
  .token-display {
    transition: opacity 0.2s;
    opacity: 0;
  }

  &:hover {
    .assistant-label,
    .token-display {
      opacity: 1;
    }
  }
`

const ErrorContainer = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 0.5rem;
  padding: 0.4rem 0.4rem 0.4rem 0.8rem;
  border: 1px solid ${color("red")};
  border-radius: 0.6rem;
  color: ${color("foreground")};
  font-size: 1.4rem;
  line-height: 2rem;
  width: 100%;
`

const RetryButton = styled(Button)`
  margin-left: auto;
  flex-shrink: 0;
  padding: 0.5rem 0.8rem;
  height: auto;
`

const MessagesEnd = styled.div`
  min-height: 1px;
  width: 100%;
  background: transparent;
`

const DiffContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 1rem;
  padding: 8px 12px;
  border: 1px solid ${color("selection")};
  border-radius: 8px;
  background: ${color("backgroundDarker")};
  width: 100%;
`

const DiffHeader = styled(Box)<{ $isExpanded?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid ${color("selectionDarker")};
  width: 100%;
  ${({ $isExpanded }) =>
    !$isExpanded &&
    css`
      border-bottom: 0;
      padding-bottom: 0;
    `}
`

const DiffHeaderLeft = styled(Box)`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 4px 0;
`

const DiffHeaderLabel = styled.span`
  font-size: 1.4rem;
  color: ${color("offWhite")};
`

const DiffHeaderRight = styled(Box)`
  display: flex;
  align-items: center;
  gap: 1.8rem;
  margin-left: auto;
`

const DiffHeaderStatus = styled(Box)<{
  $isAccepted?: boolean
  $isRejected?: boolean
  $isRejectedWithFollowUp?: boolean
}>`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  color: ${({ $isAccepted, $isRejected, $isRejectedWithFollowUp }) => {
    if ($isRejected) return color("red")
    if ($isRejectedWithFollowUp) return color("cyan")
    if ($isAccepted) return color("greenDarker")
    return color("gray2")
  }};
  font-size: 1.3rem;
`

const StatusIcon = styled.span<{
  $isAccepted?: boolean
  $isRejected?: boolean
  $isRejectedWithFollowUp?: boolean
}>`
  display: flex;
  align-items: center;
  color: ${({ $isAccepted, $isRejected, $isRejectedWithFollowUp }) => {
    if ($isRejected) return color("red")
    if ($isRejectedWithFollowUp) return color("cyan")
    if ($isAccepted) return color("greenDarker")
    return color("gray2")
  }};
`

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  height: 22px;
  width: 22px;
  color: ${color("gray2")};

  &:hover {
    svg {
      filter: brightness(1.3);
    }
  }
`

const ExpandButton = styled(IconButton)`
  width: 16px;
  height: 16px;
`

const DiffEditorWrapper = styled.div`
  position: relative;
  width: 100%;
`

const ButtonBar = styled(Box)`
  padding: 0.5rem;
  gap: 1rem;
  justify-content: center;
  flex-shrink: 0;
  width: fit-content;
  margin: 0 auto;
  background: ${color("backgroundDarker")};
  border: 1px solid ${color("selection")};
  border-radius: 0.4rem;
`

const AcceptButton = styled(Button)`
  background: ${({ theme }) => theme.color.pinkDarker};
  color: ${color("foreground")};
  border: 0.1rem solid ${({ theme }) => theme.color.pinkDarker};
  width: 10rem;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.pinkDarker};
    border-color: ${({ theme }) => theme.color.pinkDarker};
    filter: brightness(1.2);
  }
`

const RejectButton = styled(Button)`
  background: ${color("background")};
  color: ${color("foreground")};
  border: 1px solid transparent;
  width: 10rem;

  &:hover:not(:disabled) {
    background: ${color("selection")};
    border-color: transparent;
  }
`

export type OpenInEditorContent =
  | { type: "diff"; original: string; modified: string }
  | { type: "code"; value: string }

type ChatMessagesProps = {
  messages: ConversationMessage[]
  onAcceptChange?: (messageId: string) => void
  onRejectChange?: (messageId: string) => void
  onRunQuery?: (sql: string) => void
  onOpenInEditor: (
    content: OpenInEditorContent,
    existingQuery?: boolean,
  ) => Promise<void>
  // Apply SQL to editor and mark that specific message as accepted
  onApplyToEditor?: (messageId: string, sql: string) => void
  onRetry?: (userMessageId: string) => void
  // Query execution status
  running?: RunningType
  aiSuggestionRequest?: { query: string; startOffset: number } | null
  // Query notifications for this conversation's buffer - keyed by QueryKey
  queryNotifications?: Record<QueryKey, QueryNotifications>
  // The start offset used when running queries from this conversation
  queryStartOffset?: number
  // Whether an AI operation is in progress
  isOperationInProgress?: boolean
  // Current SQL in editor (acceptedSQL) - used to hide Apply button when suggestion matches editor
  editorSQL?: string
  isStreaming: boolean
  isLoadingMessages?: boolean
  // Message ID to scroll to (for cache hits)
  scrollToMessageId?: string | null
  onScrollToMessageComplete: () => void
}

const getOperationBadgeInfo = (
  displayType: UserMessageDisplayType,
): { icon: React.ReactNode; title: string; description?: string } | null => {
  switch (displayType) {
    case "fix_request":
      return {
        icon: <HammerIcon size={24} />,
        title: "Fix Query",
        description:
          "Help me debug and fix the error with the attached SQL query",
      }
    case "explain_request":
      return {
        icon: <FileSqlIcon size={24} />,
        title: "Explain Query",
        description: "Explain this query in detail",
      }
    case "schema_explain_request": {
      return {
        icon: <GradientIcon size={24} />,
        title: "Explain Schema",
        description:
          "Provide an overview, detailed column descriptions and storage details.",
      }
    }
    case "health_issue_request": {
      return {
        icon: <StethoscopeIcon size={24} />,
        title: "Health Issue Analysis",
        description:
          "Analyze table health issue and provide steps for resolution:",
      }
    }
    default:
      return null
  }
}

// Helper to get the appropriate icon based on query run status
const getQueryStatusIcon = (status: QueryRunStatus) => {
  switch (status) {
    case "loading":
      return <LoadingIcon />
    case "success":
      return <SuccessIcon />
    case "error":
      return <ErrorIcon />
    default:
      return <PlayIcon />
  }
}

export const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  onAcceptChange,
  onRejectChange,
  onRunQuery,
  onOpenInEditor,
  onApplyToEditor,
  onRetry,
  running,
  aiSuggestionRequest,
  queryNotifications,
  queryStartOffset = 0,
  isOperationInProgress,
  editorSQL,
  isStreaming,
  isLoadingMessages,
  scrollToMessageId,
  onScrollToMessageComplete,
}) => {
  const theme = useTheme()
  const dispatch = useDispatch()
  const tables = useSelector(selectors.query.getTables)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const { status } = useAIStatus()
  const [scrolled, setScrolled] = useState(false)
  const userScrolledRef = useRef(false)

  const handleScrollNeeded = useCallback(() => {
    if (scrolled && userScrolledRef.current) return
    if (scrollToMessageId) return
    const behavior = scrolled ? "smooth" : "instant"
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior })
      setScrolled(true)
    })
  }, [scrolled, scrollToMessageId])

  const handleSchemaNameDisplayClick = useCallback(
    (schemaData: SchemaDisplayData) => {
      const table = tables.find(
        (t) =>
          t.table_name === schemaData.tableName &&
          getTableKind(t) === schemaData.kind,
      )
      if (table) {
        dispatch(
          actions.console.pushSidebarHistory({
            type: "tableDetails",
            payload: {
              tableName: table.table_name,
              isMatView: table.table_type === "M",
              isView: table.table_type === "V",
            },
          }),
        )
      }
    },
    [tables],
  )

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleWheel = () => {
      userScrolledRef.current = true
    }

    container.addEventListener("wheel", handleWheel)
    return () => container.removeEventListener("wheel", handleWheel)
  }, [])

  useEffect(() => {
    userScrolledRef.current = false
  }, [messages.length])

  const latestDiffIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === "assistant" && msg.sql) {
        return i
      }
    }
    return -1
  }, [messages])

  const prevLatestDiffIndexRef = useRef<number>(
    latestDiffIndex >= 0 ? latestDiffIndex : -1,
  )

  const [expandedDiffs, setExpandedDiffs] = useState<Set<number>>(
    latestDiffIndex >= 0 ? new Set([latestDiffIndex]) : new Set(),
  )

  useEffect(() => {
    // Only auto-expand if this is a genuinely new diff (index changed)
    if (
      latestDiffIndex >= 0 &&
      latestDiffIndex !== prevLatestDiffIndexRef.current
    ) {
      setExpandedDiffs((prev) => new Set([...prev, latestDiffIndex]))
      prevLatestDiffIndexRef.current = latestDiffIndex
    }
  }, [latestDiffIndex])

  const { visibleEntries, lastAssistantAnchorIndex } = useMemo(
    () => projectConversationTurns(messages),
    [messages],
  )

  const scrollLength = useMemo(
    () => getScrollLength(isStreaming, messages),
    [isStreaming, messages],
  )

  useEffect(() => {
    handleScrollNeeded()
  }, [scrollLength])

  useLayoutEffect(() => {
    if (!scrollToMessageId || isLoadingMessages) return

    const messageEl = messageRefs.current.get(scrollToMessageId)
    if (messageEl) {
      const timeoutId = setTimeout(() => {
        messageEl.scrollIntoView({ behavior: "smooth", block: "start" })
        setScrolled(true)
        onScrollToMessageComplete()
      }, 100)
      return () => clearTimeout(timeoutId)
    }
  }, [scrollToMessageId, isLoadingMessages, onScrollToMessageComplete])

  useEffect(() => {
    return () => {
      onScrollToMessageComplete()
    }
  }, [])

  const lastVisibleEntry = visibleEntries[visibleEntries.length - 1]
  const lastVisibleMessageIndex =
    visibleEntries.length > 0
      ? lastVisibleEntry.type === "user"
        ? lastVisibleEntry.index
        : lastVisibleEntry.anchorIndex
      : -1

  const lastAssistantMessageIndex = lastAssistantAnchorIndex

  const hasVisibleUserMessageAfter = (index: number): boolean => {
    for (let i = index + 1; i < messages.length; i++) {
      if (messages[i].role === "user" && !messages[i].hideFromUI) {
        return true
      }
    }
    return false
  }

  return (
    <MessagesContainer
      ref={messagesContainerRef}
      $scrolled={scrolled}
      data-hook="chat-messages-container"
    >
      {visibleEntries.map((entry) => {
        if (entry.type === "user") {
          const { message } = entry
          const key = `${message.id}`
          const severity = message.displayHealthIssueData?.severity
          const isCurrentQuery =
            normalizeQueryText(message.sql || "") ===
            normalizeQueryText(editorSQL || "")

          // Check if this is a special request type with inline SQL display
          const displayType = message.displayType
          const sql = message.sql

          // Render badge/title/description types
          if (displayType && displayType !== "ask_request") {
            const badgeInfo = getOperationBadgeInfo(displayType)

            // Determine content to render below badge/description
            let content: React.ReactNode = null

            if (
              displayType === "schema_explain_request" &&
              message.displaySchemaData
            ) {
              const schemaData = message.displaySchemaData
              content = (
                <UserRequestContent>
                  <SchemaNameDisplay
                    onClick={() => handleSchemaNameDisplayClick(schemaData)}
                  >
                    <TableIcon
                      kind={schemaData.kind}
                      partitionBy={schemaData.partitionBy}
                      walEnabled={schemaData.walEnabled}
                      designatedTimestamp={schemaData.designatedTimestamp}
                    />
                    <SchemaName>{schemaData.tableName}</SchemaName>
                  </SchemaNameDisplay>
                </UserRequestContent>
              )
            } else if (
              displayType === "health_issue_request" &&
              message.displayHealthIssueData
            ) {
              const healthData = message.displayHealthIssueData
              content = (
                <UserRequestContent>
                  <SchemaNameDisplay>
                    <TableIcon kind="table" />
                    <SchemaName>{healthData.tableName}</SchemaName>
                  </SchemaNameDisplay>
                </UserRequestContent>
              )
            } else if (sql) {
              // fix_request and explain_request show SQL editor
              content = (
                <UserRequestContent>
                  <InlineSQLEditor data-hook="user-request-sql-editor">
                    <LiteEditor
                      value={sql}
                      maxHeight={216}
                      onOpenInEditor={() =>
                        onOpenInEditor(
                          { type: "code", value: sql },
                          isCurrentQuery,
                        )
                      }
                    />
                  </InlineSQLEditor>
                </UserRequestContent>
              )
            }

            return (
              <UserRequestBox
                key={key}
                data-hook="chat-message-user"
                ref={(el) => {
                  if (el) messageRefs.current.set(message.id, el)
                }}
              >
                <OperationBadge>
                  <BadgeIconContainer>
                    <BadgeIconWrapper>{badgeInfo?.icon}</BadgeIconWrapper>
                  </BadgeIconContainer>
                  <BadgeTitle>{badgeInfo?.title}</BadgeTitle>
                </OperationBadge>
                {badgeInfo?.description && (
                  <BadgeDescriptionContainer>
                    <BadgeDescriptionText>
                      {badgeInfo.description}
                    </BadgeDescriptionText>
                    {displayType === "health_issue_request" &&
                      message.displayHealthIssueData?.issueMessage && (
                        <IssueMessageRow>
                          {severity === "critical" ? (
                            <XSquareIcon
                              size={14}
                              weight="fill"
                              color={theme.color.red}
                            />
                          ) : (
                            <WarningIcon
                              size={14}
                              weight="fill"
                              color={theme.color.orange}
                            />
                          )}
                          <BadgeDescriptionIssueText
                            color={severity === "critical" ? "red" : "orange"}
                          >
                            {message.displayHealthIssueData.issueMessage}
                          </BadgeDescriptionIssueText>
                        </IssueMessageRow>
                      )}
                  </BadgeDescriptionContainer>
                )}
                {content}
              </UserRequestBox>
            )
          }

          // Special handling for ask_request: show user's question above SQL
          if (displayType === "ask_request" && sql) {
            const userQuestion =
              message.displayUserMessage || message.content || ""

            return (
              <UserRequestBox
                key={key}
                data-hook="chat-message-user"
                ref={(el) => {
                  if (el) messageRefs.current.set(message.id, el)
                }}
              >
                <UserRequestHeader>
                  <MessageContent>{userQuestion}</MessageContent>
                </UserRequestHeader>
                <UserRequestContent>
                  <InlineSQLEditor data-hook="user-request-sql-editor">
                    <LiteEditor
                      value={sql}
                      maxHeight={216}
                      onOpenInEditor={() =>
                        onOpenInEditor(
                          { type: "code", value: sql },
                          isCurrentQuery,
                        )
                      }
                    />
                  </InlineSQLEditor>
                </UserRequestContent>
              </UserRequestBox>
            )
          }

          // Default: plain text message
          return (
            <MessageBubble
              key={key}
              data-hook="chat-message-user"
              ref={(el) => {
                if (el) messageRefs.current.set(message.id, el)
              }}
            >
              <MessageContent>{message.content}</MessageContent>
            </MessageBubble>
          )
        }

        const {
          anchorMessage: message,
          anchorIndex: originalIndex,
          turnMessages,
        } = entry
        const key = `${message.id}`
        const isCurrentQuery =
          normalizeQueryText(message.sql || "") ===
          normalizeQueryText(editorSQL || "")

        // Assistant message - show as ExplanationBox (bundle entire turn under anchor)
        const hasSQLChange = !!message.sql
        const isSQLUnchanged =
          hasSQLChange &&
          message.previousSQL !== undefined &&
          normalizeQueryText(message.sql || "") ===
            normalizeQueryText(message.previousSQL || "")
        const isExpanded = expandedDiffs.has(originalIndex)

        // Read status from message, compute isRejectedWithFollowUp from message positions
        const isAccepted = message.isAccepted === true
        const isRejected = message.isRejected === true
        // A message is "followed up" if it has SQL, isn't accepted/rejected, and has a visible user message after it
        const isRejectedWithFollowUp =
          hasSQLChange &&
          !isAccepted &&
          !isRejected &&
          hasVisibleUserMessageAfter(originalIndex)

        const isLastVisibleMessage = originalIndex === lastVisibleMessageIndex
        const isMessageStreaming = isStreaming && isLastVisibleMessage
        const showButtons =
          hasSQLChange &&
          !isSQLUnchanged &&
          !isAccepted &&
          !isRejected &&
          !isRejectedWithFollowUp &&
          isLastVisibleMessage

        // Compute query run status for this message's SQL
        let queryRunStatus: QueryRunStatus = "neutral"
        if (message.sql) {
          const normalizedMessageSQL = normalizeQueryText(message.sql)
          // Check if this query is currently running
          if (
            running === RunningType.AI_SUGGESTION &&
            aiSuggestionRequest &&
            normalizeQueryText(aiSuggestionRequest.query) ===
              normalizedMessageSQL
          ) {
            queryRunStatus = "loading"
          }
          // Check if we have a notification for this specific query in queryNotifications
          // The query key is created from the normalized SQL and the conversation's queryStartOffset
          else if (queryNotifications) {
            const queryKey = createQueryKey(
              normalizedMessageSQL,
              queryStartOffset,
            )
            const notification = queryNotifications[queryKey]?.latest
            if (notification) {
              if (notification.type === NotificationType.ERROR) {
                queryRunStatus = "error"
              } else if (
                notification.type === NotificationType.SUCCESS ||
                notification.type === NotificationType.INFO
              ) {
                queryRunStatus = "success"
              }
            }
          }
        }

        const previousSQLForDiff = trimSemicolonForDisplay(message.previousSQL)
        const currentSQLForDiff = trimSemicolonForDisplay(message.sql)

        const hasError = !!message.error
        const showRetry =
          hasError &&
          !isStreaming &&
          !isOperationInProgress &&
          isLastVisibleMessage

        const isLiveOperation =
          originalIndex === lastAssistantMessageIndex &&
          isOperationInProgress === true

        const hasOperationHistory =
          !!message.operationHistory && message.operationHistory.length > 0

        return (
          <ExplanationBox
            key={key}
            $hasOperationHistory={hasOperationHistory}
            data-hook="chat-message-assistant"
            ref={(el) => {
              if (el) messageRefs.current.set(message.id, el)
            }}
          >
            <AssistantMessageContent
              turnMessages={turnMessages}
              anchorMessage={message}
              status={status}
              isLiveOperation={isLiveOperation}
              isMessageStreaming={isMessageStreaming}
              onScrollNeeded={handleScrollNeeded}
              onOpenInEditor={onOpenInEditor}
            />
            {hasSQLChange && !isMessageStreaming && (
              <DiffContainer data-hook="inline-diff-container">
                <DiffHeader $isExpanded={isExpanded}>
                  <DiffHeaderLeft>
                    <CodeIcon size={22} color="#BDBDBD" />
                    <DiffHeaderLabel>Suggested change</DiffHeaderLabel>
                  </DiffHeaderLeft>
                  {isSQLUnchanged && (
                    <DiffHeaderStatus data-hook="diff-status-unchanged">
                      <StatusIcon>
                        <CheckmarkOutline size="14px" />
                      </StatusIcon>
                      Already accepted
                    </DiffHeaderStatus>
                  )}
                  {!isSQLUnchanged &&
                    (isAccepted || isRejected || isRejectedWithFollowUp) && (
                      <DiffHeaderStatus
                        $isAccepted={isAccepted}
                        $isRejected={isRejected}
                        $isRejectedWithFollowUp={isRejectedWithFollowUp}
                        data-hook={
                          isRejected
                            ? "diff-status-rejected"
                            : isRejectedWithFollowUp
                              ? "diff-status-followed-up"
                              : "diff-status-accepted"
                        }
                      >
                        <StatusIcon
                          $isAccepted={isAccepted}
                          $isRejected={isRejected}
                          $isRejectedWithFollowUp={isRejectedWithFollowUp}
                        >
                          {isRejected ? (
                            <CloseOutline size="14px" />
                          ) : isRejectedWithFollowUp ? (
                            <ChatDotsIcon size="14px" />
                          ) : (
                            <CheckmarkOutline size="14px" />
                          )}
                        </StatusIcon>
                        {isRejected
                          ? "Rejected"
                          : isRejectedWithFollowUp
                            ? "Followed up"
                            : "Accepted"}
                      </DiffHeaderStatus>
                    )}
                  <DiffHeaderRight>
                    <IconButton
                      onClick={(e) => {
                        e.stopPropagation()
                        if (message.sql && onRunQuery) {
                          onRunQuery(message.sql)
                        }
                      }}
                      title="Run this query"
                      data-hook="message-action-run-sql"
                    >
                      {getQueryStatusIcon(queryRunStatus)}
                    </IconButton>
                    {!showButtons &&
                      onApplyToEditor &&
                      !(originalIndex === latestDiffIndex && isAccepted) &&
                      !isCurrentQuery && (
                        <IconButton
                          onClick={(e) => {
                            e.stopPropagation()
                            if (
                              message.id &&
                              message.sql &&
                              !isOperationInProgress
                            ) {
                              void trackEvent(
                                ConsoleEvent.AI_EDITOR_SUGGESTION_APPLY,
                              )
                              onApplyToEditor(message.id, message.sql)
                            }
                          }}
                          title="Apply to editor"
                          disabled={isOperationInProgress}
                          style={{
                            opacity: isOperationInProgress ? 0.5 : 1,
                            cursor: isOperationInProgress
                              ? "not-allowed"
                              : "pointer",
                          }}
                          data-hook="message-action-apply"
                        >
                          <KeyReturnIcon size={22} color="#BDBDBD" />
                        </IconButton>
                      )}
                    <ExpandButton
                      title="Expand diff view"
                      data-hook="diff-expand-button"
                      onClick={() => {
                        setExpandedDiffs((prev) => {
                          const next = new Set(prev)
                          if (next.has(originalIndex)) {
                            next.delete(originalIndex)
                          } else {
                            next.add(originalIndex)
                          }
                          return next
                        })
                      }}
                    >
                      <ExpandUpDownIcon />
                    </ExpandButton>
                  </DiffHeaderRight>
                </DiffHeader>
                {isExpanded && (
                  <>
                    <DiffEditorWrapper>
                      <LiteEditor
                        diffEditor
                        original={previousSQLForDiff}
                        modified={currentSQLForDiff}
                        maxHeight={300}
                        onOpenInEditor={() =>
                          onOpenInEditor({
                            type: "diff",
                            original: previousSQLForDiff ?? "",
                            modified: currentSQLForDiff ?? "",
                          })
                        }
                        handleScrollNeeded={handleScrollNeeded}
                      />
                    </DiffEditorWrapper>
                    {showButtons && (
                      <ButtonBar align="center" justifyContent="center">
                        {onRejectChange && message.id && (
                          <RejectButton
                            onClick={() => onRejectChange(message.id)}
                            data-hook="message-action-reject"
                          >
                            Reject
                          </RejectButton>
                        )}
                        {onAcceptChange && message.id && (
                          <AcceptButton
                            onClick={() => onAcceptChange(message.id)}
                            data-hook="message-action-accept"
                          >
                            Accept
                          </AcceptButton>
                        )}
                      </ButtonBar>
                    )}
                  </>
                )}
              </DiffContainer>
            )}
            {hasError && (
              <ErrorContainer data-hook="chat-message-error">
                <CloseCircle
                  size={16}
                  color={theme.color.red}
                  style={{ flexShrink: 0 }}
                />
                {message.error}
                {showRetry && onRetry && (
                  <RetryButton
                    size="sm"
                    skin="secondary"
                    prefixIcon={<ArrowCounterClockwiseIcon size={12} />}
                    onClick={() => {
                      const userMessageIndex = messages
                        .slice(0, originalIndex)
                        .findLastIndex((m) => m.role === "user")
                      if (userMessageIndex >= 0) {
                        onRetry(messages[userMessageIndex].id)
                      }
                    }}
                    data-hook="retry-button"
                  >
                    Retry
                  </RetryButton>
                )}
              </ErrorContainer>
            )}
          </ExplanationBox>
        )
      })}
      <MessagesEnd ref={messagesEndRef} data-hook="messages-end" />
    </MessagesContainer>
  )
}
