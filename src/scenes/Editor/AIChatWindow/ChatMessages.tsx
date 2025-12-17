import React, { useEffect, useRef, useMemo, useState } from "react"
import styled, { css, keyframes, useTheme } from "styled-components"
import { LiteEditor } from "../../../components/LiteEditor"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Box, Text, Button } from "../../../components"
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
import { CheckmarkOutline, CloseOutline } from "@styled-icons/evaicons-outline"
import { TableIcon } from "../../Schema/table-icon"
import type { QueryNotifications } from "../../../store/Query/types"
import { NotificationType, RunningType } from "../../../store/Query/types"
import type { QueryKey } from "../Monaco/utils"

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

const MessagesContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
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

const ExplanationBox = styled(Box)`
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

const SparkleIcon = styled.img`
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
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
  onAcceptChange?: (messageIndex: number) => void
  onRejectChange?: () => void
  onRunQuery?: (sql: string) => void
  onExpandDiff?: (original: string, modified: string) => void
  // Apply SQL to editor and mark that specific message as accepted
  onApplyToEditor?: (sql: string, messageIndex: number) => void
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
  displayDescription?: string,
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
    case "generate_request":
      return {
        icon: "/assets/icon-generate-queries.svg",
        title: "Generate Query",
        description:
          displayDescription || "Generating a query from your description",
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

  // Find the latest assistant message with SQL changes and auto-expand it
  const latestDiffIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      // Note: previousSQL can be empty string for generate flow, so we check for undefined
      if (
        msg.role === "assistant" &&
        msg.sql &&
        msg.previousSQL !== undefined
      ) {
        return i
      }
    }
    return -1
  }, [messages])

  // Track the previous latest diff index to detect new diffs
  const prevLatestDiffIndexRef = useRef<number>(
    latestDiffIndex >= 0 ? latestDiffIndex : -1,
  )

  const [expandedDiffs, setExpandedDiffs] = useState<Set<number>>(
    latestDiffIndex >= 0 ? new Set([latestDiffIndex]) : new Set(),
  )

  // Only auto-expand when a NEW diff is added (not when user manually collapses)
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

  // Only scroll to bottom when there are new visible messages
  // Hidden messages (like context messages for model) shouldn't trigger scroll
  const visibleMessagesCount = useMemo(
    () => messages.filter((m) => !m.hideFromUI).length,
    [messages],
  )

  useEffect(() => {
    setTimeout(
      () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      50,
    )
  }, [visibleMessagesCount])

  // Filter out hidden messages for display, but keep original indices for status computation
  const visibleMessages: Array<{
    message: ConversationMessage
    originalIndex: number
  }> = []
  messages.forEach((msg, originalIdx) => {
    if (!msg.hideFromUI) {
      visibleMessages.push({ message: msg, originalIndex: originalIdx })
    }
  })

  // Get the index of the last visible message (for button visibility)
  const lastVisibleMessageIndex =
    visibleMessages.length > 0
      ? visibleMessages[visibleMessages.length - 1].originalIndex
      : -1

  return (
    <MessagesContainer>
      {visibleMessages.map(({ message, originalIndex }) => {
        const key = `${message.role}-${message.timestamp}-${originalIndex}`
        if (message.role === "user") {
          // Check if this is a special request type with inline SQL display
          const displayType = message.displayType
          const displaySQL = message.displaySQL
          const displayDescription = message.displayDescription

          // Render badge/title/description types
          if (
            displayType &&
            (displayType === "fix_request" ||
              displayType === "explain_request" ||
              displayType === "generate_request" ||
              displayType === "schema_explain_request")
          ) {
            const badgeInfo = getOperationBadgeInfo(
              displayType,
              displayDescription,
            )

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
            } else if (displaySQL) {
              // fix_request and explain_request show SQL editor
              const lineCount = displaySQL.split("\n").length
              const editorHeight = Math.min(Math.max(lineCount * 20, 60), 200)
              content = (
                <UserRequestContent>
                  <InlineSQLEditor style={{ height: editorHeight }}>
                    <LiteEditor value={displaySQL} />
                  </InlineSQLEditor>
                </UserRequestContent>
              )
            }

            return (
              <UserRequestBox key={key}>
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
          if (displayType === "ask_request" && displaySQL) {
            const userQuestion = message.displayUserMessage || message.content
            const lineCount = displaySQL.split("\n").length
            const editorHeight = Math.min(Math.max(lineCount * 20, 60), 200)

            return (
              <UserRequestBox key={key}>
                <UserRequestHeader>
                  <MessageContent>{userQuestion}</MessageContent>
                </UserRequestHeader>
                <UserRequestContent>
                  <InlineSQLEditor style={{ height: editorHeight }}>
                    <LiteEditor value={displaySQL} />
                  </InlineSQLEditor>
                </UserRequestContent>
              </UserRequestBox>
            )
          }

          // Default: plain text message
          return (
            <MessageBubble key={key}>
              <MessageContent>{message.content}</MessageContent>
            </MessageBubble>
          )
        } else {
          // Assistant message - show as ExplanationBox
          const explanation = message.explanation || message.content
          const tokenUsage = message.tokenUsage as
            | { inputTokens: number; outputTokens: number }
            | undefined
          let tokenDisplay: string | null = null
          if (
            tokenUsage &&
            typeof tokenUsage.inputTokens === "number" &&
            typeof tokenUsage.outputTokens === "number"
          ) {
            tokenDisplay = `${formatTokenCount(tokenUsage.inputTokens)} input / ${formatTokenCount(tokenUsage.outputTokens)} output tokens`
          }

          // Check if this message has SQL changes to show diff
          // Note: previousSQL can be empty string for generate flow, so we check for undefined/null
          const hasSQLChange =
            !!message.sql && message.previousSQL !== undefined
          const isExpanded = expandedDiffs.has(originalIndex)

          // Read status directly from message
          const isAccepted = message.isAccepted === true
          const isRejected = message.isRejected === true
          const isRejectedWithFollowUp = message.isRejectedWithFollowUp === true

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

          return (
            <ExplanationBox key={key}>
              <AssistantHeader>
                <SparkleIcon src="/assets/ai-sparkle.svg" alt="" />
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
                            ? { target: "_blank", rel: "noopener noreferrer" }
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
                            Math.max(lineCount * 20 + 16, 56),
                            316,
                          )
                          return (
                            <CodeBlockWrapper style={{ height: editorHeight }}>
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
                      {(isAccepted || isRejected || isRejectedWithFollowUp) && (
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
                          !(originalIndex === latestDiffIndex && isAccepted) &&
                          normalizeQueryText(message.sql || "") !==
                            normalizeQueryText(editorSQL || "") && (
                            <IconButton
                              onClick={(e) => {
                                e.stopPropagation()
                                if (message.sql && !isOperationInProgress) {
                                  onApplyToEditor(message.sql, originalIndex)
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
                            {onRejectChange && (
                              <RejectButton onClick={onRejectChange}>
                                Reject
                              </RejectButton>
                            )}
                            {onAcceptChange && (
                              <AcceptButton
                                onClick={() => onAcceptChange(originalIndex)}
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
            </ExplanationBox>
          )
        }
      })}
      <div ref={messagesEndRef} />
    </MessagesContainer>
  )
}
