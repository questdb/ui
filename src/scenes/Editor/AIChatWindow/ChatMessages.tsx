import React, { useEffect, useRef, useMemo, useState, useCallback } from "react"
import styled, { css, keyframes, useTheme } from "styled-components"
import { LiteEditor } from "../../../components/LiteEditor"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Box, Text, Button } from "../../../components"
import { AISparkle } from "../../../components/AISparkle"
import { AssistantModes } from "../../../components/AIStatusIndicator/AssistantModes"
import { color } from "../../../utils"
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
  GaugeIcon,
  CodeIcon,
  KeyReturnIcon,
  ChatDotsIcon,
} from "@phosphor-icons/react"
import { CloseCircle } from "@styled-icons/remix-fill"
import { CheckmarkOutline, CloseOutline } from "@styled-icons/evaicons-outline"
import { TableIcon } from "../../Schema/table-icon"
import type { QueryNotifications } from "../../../store/Query/types"
import { NotificationType, RunningType } from "../../../store/Query/types"
import type { QueryKey } from "../Monaco/utils"
import { useAIStatus } from "../../../providers/AIStatusProvider"

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
  gap: 2rem;
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
  overflow: visible;
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
  overflow: visible;
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

const BadgeIcon = styled.img`
  width: 1.8rem;
  height: 1.8rem;
`

const BadgeTitle = styled(Text)`
  font-weight: 500;
  font-size: 1.6rem;
  line-height: 1.6rem;
  color: ${color("foreground")};
`

const BadgeDescriptionContainer = styled(Box)`
  padding: 0.8rem;
  width: 100%;
`

const BadgeDescriptionText = styled(Text)`
  font-size: 1.4rem;
  line-height: 2.1rem;
  color: ${color("foreground")};
`

const SchemaNameDisplay = styled(Box)`
  margin-left: 0.4rem;
  padding: 0.8rem 1.2rem;
  align-items: center;
  gap: 1rem;
  border-radius: 8px;
  border: 1px solid ${color("selection")};
  background: ${color("backgroundDarker")};
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
  overflow: visible;
`

const ExplanationBox = styled(Box)<{ $hasOperationHistory?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  align-self: flex-start;
  text-align: left;
  background: transparent;
  padding: 0.4rem;
  border-radius: 0.6rem;
  flex-shrink: 0;
  overflow: visible;

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

const AssistantHeader = styled(Box).attrs({
  alignItems: "center",
  gap: "1rem",
})`
  width: 100%;
  padding: 0.4rem;
  flex: 1 0 auto;
`

const AssistantLabel = styled(Text).attrs({ className: "assistant-label" })`
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.4rem;
  text-transform: uppercase;
  color: ${color("foreground")};
  line-height: 1;
`

const TokenDisplay = styled(Box).attrs({ className: "token-display" })`
  align-items: center;
  gap: 0.9rem;
  margin: 0 0 0 auto;
`

const ExplanationContent = styled(Box)`
  display: flex;
  flex-direction: column;
  border-radius: 0.6rem;
  padding: 0.8rem;
  overflow: visible;
  flex-shrink: 0;
  width: 100%;
`

const Divider = styled.div`
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, #9c274b 0%, rgba(54, 14, 26, 0) 100%);
  margin-bottom: 1.5rem;
`

const OperationHistoryContainer = styled.div<{ $trimBottom: boolean }>`
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  width: 100%;
  ${({ $trimBottom }) =>
    $trimBottom &&
    css`
      margin-bottom: 0;
      padding-bottom: 0.3rem;
    `}
`

const ErrorContainer = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 1rem;
  padding: 1rem 1.2rem;
  border-radius: 0.6rem;
  border: 1px solid ${color("red")};
  color: ${color("foreground")};
  font-size: 1.4rem;
  line-height: 2rem;
  width: 100%;
`

const MarkdownContent = styled.div`
  margin: 0;
  width: 100%;
  font-family: ${({ theme }) => theme.font};
  font-size: 1.4rem;
  line-height: 2.1rem;
  color: ${color("foreground")};
  overflow: visible;
  word-break: break-word;

  p {
    margin: 0 0 1rem 0;
    &:last-child {
      margin-bottom: 0;
    }
  }

  code {
    background: ${color("background")};
    border: 1px solid ${color("selection")};
    border-radius: 0.4rem;
    padding: 0.1rem 0.4rem;
    font-family: ${({ theme }) => theme.fontMonospace};
    font-size: 1.3rem;
    color: ${color("purple")};
    white-space: pre-wrap;
  }

  strong {
    font-weight: 600;
    color: ${color("foreground")};
  }

  em {
    font-style: italic;
  }

  ul,
  ol {
    margin: 0.5rem 0;
    padding-left: 2rem;
  }

  li {
    margin-bottom: 0.3rem;
  }

  a {
    color: ${({ theme }) => theme.color.cyan};
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }

  h1,
  h2,
  h3,
  h4 {
    margin: 1rem 0 0.5rem 0;
    font-weight: 600;
  }

  h1 {
    font-size: 1.8rem;
  }
  h2 {
    font-size: 1.6rem;
  }
  h3 {
    font-size: 1.5rem;
  }
  h4 {
    font-size: 1.4rem;
  }

  blockquote {
    border-left: 3px solid ${color("selection")};
    margin: 1rem 0;
    padding-left: 1rem;
    color: ${color("gray2")};
  }

  .table-wrapper {
    overflow-x: auto;
    margin: 1rem 0;
  }

  table {
    border-collapse: collapse;
    min-width: max-content;
    border-radius: 0.8rem;
  }

  th,
  td {
    padding: 0.6rem 0.8rem;
    border: 1px solid ${color("selection")};
    text-align: left;
    white-space: nowrap;
  }

  th {
    background: ${color("backgroundDarker")};
    font-weight: 600;
  }

  td:last-child {
    white-space: normal;
    min-width: 200px;
  }
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
  height: 300px;
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

const CodeBlockWrapper = styled.div`
  margin: 1rem 0;
  width: 100%;
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
  border: 0.1rem solid ${({ theme }) => theme.color.pinkDarker};
  width: 10rem;

  &:hover:not(:disabled) {
    background: ${color("selection")};
    border-color: ${({ theme }) => theme.color.pinkDarker};
  }
`

type ChatMessagesProps = {
  messages: ConversationMessage[]
  onAcceptChange?: (messageId: string) => void
  onRejectChange?: (messageId: string) => void
  onRunQuery?: (sql: string) => void
  onExpandDiff?: (original: string, modified: string) => void
  // Apply SQL to editor and mark that specific message as accepted
  onApplyToEditor?: (messageId: string, sql: string) => void
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
}

const getOperationBadgeInfo = (
  displayType: UserMessageDisplayType,
): { icon: string; title: string; description?: string } | null => {
  switch (displayType) {
    case "fix_request":
      return {
        icon: "/assets/icon-fix-queries.svg",
        title: "Fix Query",
        description:
          "Help me debug and fix the error with the attached SQL query",
      }
    case "explain_request":
      return {
        icon: "/assets/icon-explain-queries.svg",
        title: "Explain Query",
        description: "Explain this query in detail",
      }
    case "schema_explain_request": {
      return {
        icon: "/assets/icon-explain-schema.svg",
        title: "Explain Schema",
        description:
          "Provide an overview, detailed column descriptions and storage details.",
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
  onExpandDiff,
  onApplyToEditor,
  running,
  aiSuggestionRequest,
  queryNotifications,
  queryStartOffset = 0,
  isOperationInProgress,
  editorSQL,
}) => {
  const theme = useTheme()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { status } = useAIStatus()
  const [scrolled, setScrolled] = useState(false)

  const handleScrollNeeded = useCallback(() => {
    const behavior = scrolled ? "smooth" : "instant"
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior })
      setScrolled(true)
    })
  }, [scrolled])

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

  const formatTokenCount = (count: number): string => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`
    }
    return count.toString()
  }

  const visibleMessagesCount = useMemo(
    () =>
      messages.reduce(
        (acc, msg) =>
          acc +
          (msg.hideFromUI
            ? 0
            : (msg.operationHistory?.length ?? 0) +
              (msg.error || msg.content ? 1 : 0)),
        0,
      ),
    [messages],
  )

  useEffect(() => {
    handleScrollNeeded()
  }, [visibleMessagesCount])

  const visibleMessages: Array<{
    message: ConversationMessage
    originalIndex: number
  }> = []
  messages.forEach((msg, originalIdx) => {
    if (!msg.hideFromUI) {
      visibleMessages.push({ message: msg, originalIndex: originalIdx })
    }
  })

  const lastVisibleMessageIndex =
    visibleMessages.length > 0
      ? visibleMessages[visibleMessages.length - 1].originalIndex
      : -1

  const lastAssistantMessageIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && !messages[i].hideFromUI) {
        return i
      }
    }
    return -1
  }, [messages])

  const hasVisibleUserMessageAfter = (index: number): boolean => {
    for (let i = index + 1; i < messages.length; i++) {
      if (messages[i].role === "user" && !messages[i].hideFromUI) {
        return true
      }
    }
    return false
  }

  return (
    <MessagesContainer $scrolled={scrolled} data-hook="chat-messages-container">
      {visibleMessages.map(({ message, originalIndex }) => {
        const key = `${message.id}`
        if (message.role === "user") {
          // Check if this is a special request type with inline SQL display
          const displayType = message.displayType
          const sql = message.sql

          // Render badge/title/description types
          if (
            displayType &&
            (displayType === "fix_request" ||
              displayType === "explain_request" ||
              displayType === "schema_explain_request")
          ) {
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
                  <SchemaNameDisplay>
                    <TableIcon
                      isMaterializedView={schemaData.isMatView}
                      partitionBy={schemaData.partitionBy}
                      walEnabled={schemaData.walEnabled}
                      designatedTimestamp={schemaData.designatedTimestamp}
                    />
                    <SchemaName>{schemaData.tableName}</SchemaName>
                  </SchemaNameDisplay>
                </UserRequestContent>
              )
            } else if (sql) {
              // fix_request and explain_request show SQL editor
              const lineCount = sql.split("\n").length
              const editorHeight = Math.min(lineCount * 20 + 16, 200)
              content = (
                <UserRequestContent>
                  <InlineSQLEditor style={{ height: editorHeight }}>
                    <LiteEditor value={sql} />
                  </InlineSQLEditor>
                </UserRequestContent>
              )
            }

            return (
              <UserRequestBox key={key} data-hook="chat-message-user">
                <OperationBadge>
                  <BadgeIconContainer>
                    <BadgeIcon src={badgeInfo?.icon} alt={badgeInfo?.title} />
                  </BadgeIconContainer>
                  <BadgeTitle>{badgeInfo?.title}</BadgeTitle>
                </OperationBadge>
                {badgeInfo?.description && (
                  <BadgeDescriptionContainer>
                    <BadgeDescriptionText>
                      {badgeInfo.description}
                    </BadgeDescriptionText>
                  </BadgeDescriptionContainer>
                )}
                {content}
              </UserRequestBox>
            )
          }

          // Special handling for ask_request: show user's question above SQL
          if (displayType === "ask_request" && sql) {
            const userQuestion = message.displayUserMessage || message.content
            const lineCount = sql.split("\n").length
            const editorHeight = Math.min(lineCount * 20 + 16, 200)

            return (
              <UserRequestBox key={key} data-hook="chat-message-user">
                <UserRequestHeader>
                  <MessageContent>{userQuestion}</MessageContent>
                </UserRequestHeader>
                <UserRequestContent>
                  <InlineSQLEditor style={{ height: editorHeight }}>
                    <LiteEditor value={sql} />
                  </InlineSQLEditor>
                </UserRequestContent>
              </UserRequestBox>
            )
          }

          // Default: plain text message
          return (
            <MessageBubble key={key} data-hook="chat-message-user">
              <MessageContent>{message.content}</MessageContent>
            </MessageBubble>
          )
        } else {
          // Assistant message - show as ExplanationBox
          const explanation = message.explanation || message.content
          const tokenUsage = message.tokenUsage as
            | { inputTokens: number; outputTokens: number }
            | undefined
          let tokenDisplay: React.ReactNode | null = null
          if (
            tokenUsage &&
            typeof tokenUsage.inputTokens === "number" &&
            typeof tokenUsage.outputTokens === "number"
          ) {
            tokenDisplay = (
              <>
                <span style={{ fontWeight: 600 }}>
                  {formatTokenCount(tokenUsage.inputTokens)}
                </span>{" "}
                input /{" "}
                <span style={{ fontWeight: 600 }}>
                  {formatTokenCount(tokenUsage.outputTokens)}
                </span>{" "}
                output tokens
              </>
            )
          }

          const hasSQLChange = !!message.sql
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
          const showButtons =
            hasSQLChange &&
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

          const previousSQLForDiff = trimSemicolonForDisplay(
            message.previousSQL,
          )
          const currentSQLForDiff = trimSemicolonForDisplay(message.sql)

          const operationHistory = message.operationHistory
          const hasError = !!message.error

          const isLiveOperation =
            originalIndex === lastAssistantMessageIndex &&
            isOperationInProgress === true

          const hasOperationHistory =
            !!operationHistory && operationHistory.length > 0

          return (
            <ExplanationBox
              key={key}
              $hasOperationHistory={hasOperationHistory}
              data-hook="chat-message-assistant"
            >
              {hasOperationHistory && (
                <>
                  <Divider />
                  <OperationHistoryContainer
                    $trimBottom={hasError || !message.content}
                  >
                    <AssistantModes
                      operationHistory={operationHistory}
                      status={status}
                      isLive={isLiveOperation}
                      onScrollNeeded={handleScrollNeeded}
                    />
                  </OperationHistoryContainer>
                </>
              )}
              {hasError && (
                <ErrorContainer>
                  <CloseCircle
                    size={16}
                    color={theme.color.red}
                    style={{ flexShrink: 0 }}
                  />
                  {message.error}
                </ErrorContainer>
              )}

              {message.content && (
                <>
                  <AssistantHeader>
                    <AISparkle size={20} variant="filled" />
                    <AssistantLabel>Assistant</AssistantLabel>
                    {tokenDisplay && (
                      <TokenDisplay className="token-display">
                        <GaugeIcon size="16px" color={theme.color.gray2} />
                        <Text size="sm" color="gray2">
                          {tokenDisplay}
                        </Text>
                      </TokenDisplay>
                    )}
                  </AssistantHeader>
                  <ExplanationContent>
                    <MarkdownContent>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({
                            children,
                            href,
                            ...props
                          }: React.ComponentProps<"a">) => (
                            <a
                              {...(typeof href === "string" &&
                              href.startsWith("http")
                                ? {
                                    target: "_blank",
                                    rel: "noopener noreferrer",
                                  }
                                : {})}
                              href={href}
                              {...props}
                            >
                              {children}
                            </a>
                          ),
                          table: ({
                            children,
                            ...props
                          }: React.ComponentProps<"table">) => (
                            <div className="table-wrapper">
                              <table {...props}>{children}</table>
                            </div>
                          ),
                          // Render pre as fragment since code blocks are handled by code component
                          pre: ({ children }: React.ComponentProps<"pre">) => (
                            <>{children}</>
                          ),
                          code: ({
                            children,
                            className,
                          }: React.ComponentProps<"code">) => {
                            // Check if this is a code block (has language class) or inline code
                            const isCodeBlock =
                              typeof className === "string" &&
                              className.includes("language-")
                            if (isCodeBlock) {
                              // Extract text content from children (can be string or array)
                              const codeContent = (
                                Array.isArray(children)
                                  ? children.join("")
                                  : typeof children === "string"
                                    ? children
                                    : ""
                              ).replace(/\n$/, "")
                              const lineCount = codeContent.split("\n").length
                              // LiteEditor has 8px padding top and bottom (16px total)
                              const editorHeight = Math.min(
                                lineCount * 20 + 16,
                                316,
                              )
                              return (
                                <CodeBlockWrapper
                                  key={`${message.id}-${codeContent}`}
                                  style={{ height: editorHeight }}
                                >
                                  <LiteEditor value={codeContent} />
                                </CodeBlockWrapper>
                              )
                            }
                            // Inline code - render as default
                            return <code>{children}</code>
                          },
                        }}
                      >
                        {explanation}
                      </ReactMarkdown>
                    </MarkdownContent>
                    {hasSQLChange && (
                      <DiffContainer>
                        <DiffHeader $isExpanded={isExpanded}>
                          <DiffHeaderLeft>
                            <CodeIcon size={22} color="#BDBDBD" />
                            <DiffHeaderLabel>Suggested change</DiffHeaderLabel>
                          </DiffHeaderLeft>
                          {(isAccepted ||
                            isRejected ||
                            isRejectedWithFollowUp) && (
                            <DiffHeaderStatus
                              $isAccepted={isAccepted}
                              $isRejected={isRejected}
                              $isRejectedWithFollowUp={isRejectedWithFollowUp}
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
                            {/* Show Apply to Editor button only when:
                            - accept/reject buttons are NOT shown
                            - NOT the latest suggestion that is already accepted (would have no effect)
                            - suggestion SQL differs from what's in editor (otherwise no effect)
                        */}
                            {!showButtons &&
                              onApplyToEditor &&
                              !(
                                originalIndex === latestDiffIndex && isAccepted
                              ) &&
                              normalizeQueryText(message.sql || "") !==
                                normalizeQueryText(editorSQL || "") && (
                                <IconButton
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (
                                      message.id &&
                                      message.sql &&
                                      !isOperationInProgress
                                    ) {
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
                                noBorder
                                onExpandDiff={
                                  onExpandDiff
                                    ? () =>
                                        onExpandDiff(
                                          message.previousSQL || "",
                                          message.sql || "",
                                        )
                                    : undefined
                                }
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
                  </ExplanationContent>
                </>
              )}
            </ExplanationBox>
          )
        }
      })}
      <div ref={messagesEndRef} />
    </MessagesContainer>
  )
}
