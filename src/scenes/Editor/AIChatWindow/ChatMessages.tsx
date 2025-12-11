import React, { useEffect, useRef, useMemo, useState } from "react"
import styled, { keyframes, useTheme } from "styled-components"
import { DiffEditor, Editor } from "@monaco-editor/react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Box, Text, Button } from "../../../components"
import { color } from "../../../utils"
import type { ConversationMessage } from "../../../providers/AIConversationProvider/types"
import {
  QuestDBLanguageName,
  normalizeQueryText,
  createQueryKey,
} from "../Monaco/utils"
import { GaugeIcon } from "@phosphor-icons/react"
import { CheckmarkOutline, CloseOutline } from "@styled-icons/evaicons-outline"
import { Chat1 } from "@styled-icons/remix-line"
import { File } from "@styled-icons/boxicons-regular"
import { TableIcon } from "../../Schema/table-icon"
import type { QueryNotifications } from "../../../store/Query/types"
import { NotificationType, RunningType } from "../../../store/Query/types"
import type { QueryKey } from "../Monaco/utils"

// Query status type for the run button
type QueryRunStatus = "neutral" | "loading" | "success" | "error"

// Play icon (neutral state) - matches cursorQueryGlyph default
const PlayIcon = () => (
  <svg
    viewBox="0 0 24 24"
    height="24px"
    width="24px"
    fill="#50fa7b"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path fill="none" d="M0 0h24v24H0z" />
    <path d="M16.394 12 10 7.737v8.526L16.394 12zm2.982.416L8.777 19.482A.5.5 0 0 1 8 19.066V4.934a.5.5 0 0 1 .777-.416l10.599 7.066a.5.5 0 0 1 0 .832z" />
  </svg>
)

// Success icon - matches cursorQueryGlyph.success-glyph
const SuccessIcon = () => (
  <svg
    viewBox="0 0 24 24"
    height="24px"
    width="24px"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <clipPath id="clip0">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
    <g clipPath="url(#clip0)">
      <path
        d="M8 4.934v14.132c0 .433.466.702.812.484l10.563-7.066a.5.5 0 0 0 0-.832L8.812 4.616A.5.5 0 0 0 8 4.934Z"
        fill="#50fa7b"
      />
      <circle cx="18" cy="8" r="6" fill="#00aa3b" />
      <path
        d="m15 8.5 2 2 4-4"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </g>
  </svg>
)

// Error icon - matches cursorQueryGlyph.error-glyph
const ErrorIcon = () => (
  <svg
    viewBox="0 0 24 24"
    height="24px"
    width="24px"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <clipPath id="clip0">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
    <g clipPath="url(#clip0)">
      <path
        d="M8 4.934v14.132c0 .433.466.702.812.484l10.563-7.066a.5.5 0 0 0 0-.832L8.812 4.616A.5.5 0 0 0 8 4.934Z"
        fill="#50fa7b"
      />
      <circle cx="18" cy="8" r="6" fill="#ff5555" />
      <rect x="17" y="4" width="2" height="5" fill="white" rx="0.5" />
      <circle cx="18" cy="11" r="1" fill="white" />
    </g>
  </svg>
)

// Loading icon - matches cursorQueryGlyph.loading-glyph
const LoadingIconSvg = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="white"
    height="24px"
    width="24px"
  >
    <path fill="none" d="M0 0h24v24H0z" />
    <path d="M12 2a1 1 0 0 1 1 1v3a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1zm0 15a1 1 0 0 1 1 1v3a1 1 0 0 1-2 0v-3a1 1 0 0 1 1-1zm8.66-10a1 1 0 0 1-.366 1.366l-2.598 1.5a1 1 0 1 1-1-1.732l2.598-1.5A1 1 0 0 1 20.66 7zM7.67 14.5a1 1 0 0 1-.366 1.366l-2.598 1.5a1 1 0 1 1-1-1.732l2.598-1.5a1 1 0 0 1 1.366.366zM20.66 17a1 1 0 0 1-1.366.366l-2.598-1.5a1 1 0 0 1 1-1.732l2.598 1.5A1 1 0 0 1 20.66 17zM7.67 9.5a1 1 0 0 1-1.366.366l-2.598-1.5a1 1 0 1 1 1-1.732l2.598 1.5A1 1 0 0 1 7.67 9.5z" />
  </svg>
)

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

const ExpandUpDown = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="16"
    viewBox="0 0 7 12"
    fill="none"
  >
    <path
      d="M3.06 1.88667L5.17333 4L6.11333 3.06L3.06 0L0 3.06L0.946667 4L3.06 1.88667ZM3.06 10.1133L0.946667 8L0.00666682 8.94L3.06 12L6.12 8.94L5.17333 8L3.06 10.1133Z"
      fill="currentColor"
    />
  </svg>
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

const MessageBubble = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 1.2rem;
  border-radius: 0.8rem;
  max-width: 85%;
  align-self: flex-end;
  background: ${color("pinkDarker")};
  border: 1px solid ${color("pinkDarker")};
  flex-shrink: 0;
  overflow: visible;
`

const UserRequestBox = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 4px;
  max-width: 85%;
  align-self: flex-end;
  background: ${color("pinkDarker")};
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

const UserRequestLabel = styled(Text)`
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.4rem;
  color: ${color("foreground")};
  line-height: 1;
`

const UserRequestContent = styled(Box)`
  display: flex;
  flex-direction: column;
  background: ${color("backgroundDarker")};
  border: 1px solid ${color("selection")};
  border-radius: 0.6rem;
  overflow: hidden;
  flex-shrink: 0;
  width: 100%;
  align-items: flex-start;
`

const InlineSQLEditor = styled.div`
  width: 100%;
`

const DescriptionText = styled(Text)`
  font-size: 1.4rem;
  line-height: 2rem;
  color: ${color("foreground")};
  white-space: pre-wrap;
  word-wrap: break-word;
  padding: 1rem;
  width: 100%;
`

const SchemaNameDisplay = styled(Box)`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 1rem;
`

const SchemaName = styled(Text)`
  font-size: 1.4rem;
  font-weight: 600;
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
  max-width: 100%;
  align-self: flex-start;
  text-align: left;
  background: transparent;
  padding: 0.4rem;
  border-radius: 0.6rem;
  flex-shrink: 0;
  overflow: visible;
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

const AssistantLabel = styled(Text)`
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.4rem;
  text-transform: uppercase;
  color: ${color("foreground")};
  line-height: 1;
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
  max-width: 100%;
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

  pre {
    background: ${color("background")};
    border: 1px solid ${color("selection")};
    border-radius: 0.6rem;
    padding: 1rem;
    overflow-x: auto;
    margin: 1rem 0;

    code {
      background: none;
      border: none;
      padding: 0;
      font-size: 1.2rem;
      color: ${color("foreground")};
    }
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

const DiffContainer = styled(Box)<{
  $isAccepted?: boolean
  $isRejected?: boolean
  $isRejectedWithFollowUp?: boolean
}>`
  display: flex;
  flex-direction: column;
  margin-top: 1rem;
  border: 1px solid
    ${({ $isAccepted, $isRejected, $isRejectedWithFollowUp }) => {
      if ($isRejected) return color("red")
      if ($isRejectedWithFollowUp) return color("orangeDark")
      if ($isAccepted) return color("greenDarker")
      return color("selection")
    }};
  border-radius: 0.6rem;
  overflow: hidden;
  background: ${color("backgroundDarker")};
  width: 100%;
`

const DiffHeader = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.8rem;
  background: ${color("backgroundDarker")};
  width: 100%;
  cursor: pointer;

  &:hover {
    background: rgba(68, 71, 90, 0.5);
  }
`

const DiffHeaderLeft = styled(Box)`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: ${color("foreground")};
`

const DiffHeaderFileIcon = styled(File)`
  color: ${color("gray2")};
  flex-shrink: 0;
`

const DiffHeaderLabel = styled(Text)`
  font-size: 1.2rem;
  color: ${color("foreground")};
`

const DiffHeaderRight = styled(Box)`
  display: flex;
  align-items: center;
  gap: 0.8rem;
`

const DiffHeaderStatus = styled(Box)<{
  $isAccepted?: boolean
  $isRejected?: boolean
  $isRejectedWithFollowUp?: boolean
}>`
  display: flex;
  align-items: center;
  gap: 0.3rem;
  color: ${({ $isAccepted, $isRejected, $isRejectedWithFollowUp }) => {
    if ($isRejected) return color("red")
    if ($isRejectedWithFollowUp) return color("orangeDark")
    if ($isAccepted) return color("green")
    return color("gray2")
  }};
  font-size: 1.2rem;
  font-weight: 600;
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
    if ($isRejectedWithFollowUp) return color("orangeDark")
    if ($isAccepted) return color("green")
    return color("gray2")
  }};
`

const ExpandIcon = styled.span`
  display: flex;
  align-items: center;
  color: ${color("gray2")};
  margin-right: 0.2rem;
`

const RunQueryButton = styled(Button)`
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border-radius: 0.4rem;
  color: ${color("foreground")};
  cursor: pointer;
  transition: all 0.15s ease;

  &:active {
    transform: scale(0.95);
  }
`

const DiffEditorWrapper = styled.div`
  position: relative;
  height: 300px;
  width: 100%;
`

const ExpandToEditorButton = styled.button`
  position: absolute;
  bottom: 8px;
  right: 8px;
  z-index: 10;
  background: ${color("backgroundDarker")};
  border: 1px solid ${color("selection")};
  border-radius: 4px;
  color: ${color("foreground")};
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;

  ${DiffEditorWrapper}:hover & {
    opacity: 1;
  }

  &:hover {
    background: ${color("selection")};
  }
`

const DiffActions = styled(Box)`
  display: flex;
  align-items: stretch;
  padding: 0.8rem;
  gap: 0.8rem;
  border-top: 1px solid ${color("selection")};
  background: ${color("backgroundDarker")};
  width: 100%;
`

const AcceptButton = styled(Button)`
  background: ${({ theme }) => theme.color.background};
  color: ${color("foreground")};
  border: 0.1rem solid ${({ theme }) => theme.color.greenDarker};
  width: 100%;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.pink};
    border-color: ${({ theme }) => theme.color.pink};
    filter: brightness(1.1);
  }
`

const RejectButton = styled(Button)`
  background: ${color("background")};
  color: ${color("foreground")};
  border: 0.1rem solid ${color("selection")};
  width: 100%;
  &:hover:not(:disabled) {
    background: ${color("backgroundDarker")};
    border-color: ${color("gray2")};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

type ChatMessagesProps = {
  messages: ConversationMessage[]
  hasPendingDiff?: boolean
  onAcceptChange?: (messageIndex: number) => void
  onRejectChange?: () => void
  onRunQuery?: (sql: string) => void
  onExpandDiff?: (
    original: string,
    modified: string,
    queryKey: QueryKey,
  ) => void
  // Query execution status
  running?: RunningType
  aiSuggestionRequest?: { query: string; startOffset: number } | null
  // Query notifications for this conversation's buffer - keyed by QueryKey
  queryNotifications?: Record<QueryKey, QueryNotifications>
  // The start offset used when running queries from this conversation
  queryStartOffset?: number
  // The queryKey for this conversation (for diff buffer linking)
  conversationQueryKey?: QueryKey
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
  hasPendingDiff,
  onAcceptChange,
  onRejectChange,
  onRunQuery,
  onExpandDiff,
  running,
  aiSuggestionRequest,
  queryNotifications,
  queryStartOffset = 0,
  conversationQueryKey,
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

  useEffect(() => {
    setTimeout(
      () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      50,
    )
  }, [messages])

  // Pre-compute which diffs are accepted, rejected, and which is the latest unaccepted
  const diffStatuses = useMemo(() => {
    const statuses: Map<
      number,
      {
        isAccepted: boolean
        isRejected: boolean
        isRejectedWithFollowUp: boolean
        isLatestUnaccepted: boolean
      }
    > = new Map()

    // Find all assistant messages with SQL changes
    const diffsWithSQL: Array<{
      index: number
      sql: string
      isRejected: boolean
      isRejectedWithFollowUp: boolean
      isAccepted: boolean
    }> = []
    messages.forEach((msg, idx) => {
      // Note: previousSQL can be empty string for generate flow, so we check for undefined
      if (
        msg.role === "assistant" &&
        msg.sql &&
        msg.previousSQL !== undefined
      ) {
        diffsWithSQL.push({
          index: idx,
          sql: msg.sql,
          isRejected: msg.isRejected === true,
          isRejectedWithFollowUp: msg.isRejectedWithFollowUp === true,
          isAccepted: msg.isAccepted === true,
        })
      }
    })

    // Determine which diffs are accepted and rejected
    diffsWithSQL.forEach(
      ({ index, isRejected, isRejectedWithFollowUp, isAccepted }) => {
        statuses.set(index, {
          isAccepted,
          isRejected,
          isRejectedWithFollowUp,
          isLatestUnaccepted: false,
        })
      },
    )

    // Find the latest unaccepted and non-rejected diff
    for (let i = diffsWithSQL.length - 1; i >= 0; i--) {
      const { index, isRejected, isAccepted } = diffsWithSQL[i]
      const status = statuses.get(index)
      if (status && !isAccepted && !isRejected) {
        status.isLatestUnaccepted = true
        break
      }
    }

    return statuses
  }, [messages])

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

  return (
    <MessagesContainer>
      {visibleMessages.map(({ message, originalIndex }) => {
        const key = `${message.role}-${message.timestamp}-${originalIndex}`
        if (message.role === "user") {
          // Check if this is a special request type with inline SQL display
          const displayType = message.displayType
          const displaySQL = message.displaySQL
          const displayDescription = message.displayDescription

          // Handle generate_request type (shows description instead of SQL)
          if (displayType === "generate_request" && displayDescription) {
            return (
              <UserRequestBox key={key}>
                <UserRequestHeader>
                  <UserRequestLabel>
                    Generate query with description
                  </UserRequestLabel>
                </UserRequestHeader>
                <UserRequestContent>
                  <DescriptionText>{displayDescription}</DescriptionText>
                </UserRequestContent>
              </UserRequestBox>
            )
          }

          if (
            displayType === "schema_explain_request" &&
            message.displaySchemaData
          ) {
            const schemaData = message.displaySchemaData
            return (
              <UserRequestBox key={key}>
                <UserRequestHeader>
                  <UserRequestLabel>
                    Requested explanation for{" "}
                    {schemaData.isMatView ? "materialized view" : "table"}{" "}
                    schema
                  </UserRequestLabel>
                </UserRequestHeader>
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
              </UserRequestBox>
            )
          }

          if (displayType && displaySQL) {
            // Get display label based on type
            const displayLabel =
              displayType === "fix_request"
                ? "Requested fix for the query"
                : displayType === "explain_request"
                  ? "Requested explanation for the query"
                  : null // ask_request shows user's question directly

            // Calculate editor height based on SQL content
            const lineCount = displaySQL.split("\n").length
            const editorHeight = Math.min(Math.max(lineCount * 20, 60), 200)

            // Special handling for ask_request: show user's question above SQL
            if (displayType === "ask_request") {
              const userQuestion = message.displayUserMessage || message.content

              return (
                <UserRequestBox key={key}>
                  <UserRequestHeader>
                    <MessageContent>{userQuestion}</MessageContent>
                  </UserRequestHeader>
                  <UserRequestContent>
                    <InlineSQLEditor style={{ height: editorHeight }}>
                      <Editor
                        height="100%"
                        language={QuestDBLanguageName}
                        value={displaySQL}
                        theme="dracula"
                        options={{
                          readOnly: true,
                          lineNumbers: "off",
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          folding: false,
                          glyphMargin: false,
                          lineDecorationsWidth: 0,
                          lineNumbersMinChars: 0,
                          renderLineHighlight: "none",
                          overviewRulerLanes: 0,
                          hideCursorInOverviewRuler: true,
                          overviewRulerBorder: false,
                          scrollbar: {
                            vertical: "hidden",
                            horizontal: "hidden",
                          },
                          fontSize: 12,
                          padding: { top: 8, bottom: 8 },
                        }}
                      />
                    </InlineSQLEditor>
                  </UserRequestContent>
                </UserRequestBox>
              )
            }

            if (displayLabel) {
              return (
                <UserRequestBox key={key}>
                  <UserRequestHeader>
                    <UserRequestLabel>{displayLabel}</UserRequestLabel>
                  </UserRequestHeader>
                  <UserRequestContent>
                    <InlineSQLEditor style={{ height: editorHeight }}>
                      <Editor
                        height="100%"
                        language={QuestDBLanguageName}
                        value={displaySQL}
                        theme="dracula"
                        options={{
                          readOnly: true,
                          lineNumbers: "off",
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          folding: false,
                          glyphMargin: false,
                          lineDecorationsWidth: 0,
                          lineNumbersMinChars: 0,
                          renderLineHighlight: "none",
                          overviewRulerLanes: 0,
                          hideCursorInOverviewRuler: true,
                          overviewRulerBorder: false,
                          scrollbar: {
                            vertical: "hidden",
                            horizontal: "hidden",
                          },
                          fontSize: 12,
                          padding: { top: 8, bottom: 8 },
                        }}
                      />
                    </InlineSQLEditor>
                  </UserRequestContent>
                </UserRequestBox>
              )
            }
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
          const isRejectable = message.isRejectable === true

          // Get diff status from pre-computed map (use original index)
          const diffStatus = hasSQLChange
            ? diffStatuses.get(originalIndex)
            : null
          const isAccepted = diffStatus?.isAccepted ?? false
          const isRejected = diffStatus?.isRejected ?? false
          const isRejectedWithFollowUp =
            diffStatus?.isRejectedWithFollowUp ?? false
          const isLatestUnacceptedDiff = diffStatus?.isLatestUnaccepted ?? false

          // Show buttons only if diff hasn't been accepted and hasn't been rejected (either type)
          const showButtons =
            hasSQLChange &&
            !isAccepted &&
            !isRejected &&
            !isRejectedWithFollowUp
          // Show reject button only on latest unaccepted diff
          const showRejectButton =
            showButtons && isLatestUnacceptedDiff && isRejectable

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

          // Prepare SQL for diff display (remove semicolons)
          let previousSQLForDiff = "\n"
          if (message.previousSQL && typeof message.previousSQL === "string") {
            let trimmed = message.previousSQL.trim()
            if (trimmed.endsWith(";")) {
              trimmed = trimmed.slice(0, -1).trim()
            }
            previousSQLForDiff = trimmed + "\n"
          }
          let currentSQLForDiff = "\n"
          if (message.sql && typeof message.sql === "string") {
            let trimmed = message.sql.trim()
            if (trimmed.endsWith(";")) {
              trimmed = trimmed.slice(0, -1).trim()
            }
            currentSQLForDiff = trimmed + "\n"
          }

          return (
            <ExplanationBox key={key}>
              <AssistantHeader>
                <SparkleIcon src="/assets/ai-sparkle.svg" alt="" />
                <AssistantLabel>Assistant</AssistantLabel>
                {tokenDisplay && (
                  <Box align="center" gap="0.9rem" margin="0 0 0 auto">
                    <GaugeIcon size="16px" color={theme.color.gray2} />
                    <Text size="sm" color="gray2">
                      {tokenDisplay}
                    </Text>
                  </Box>
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
                    }}
                  >
                    {explanation}
                  </ReactMarkdown>
                </MarkdownContent>
                {hasSQLChange && (
                  <DiffContainer
                    $isAccepted={isAccepted}
                    $isRejected={isRejected}
                    $isRejectedWithFollowUp={isRejectedWithFollowUp}
                  >
                    <DiffHeader
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
                      <DiffHeaderLeft>
                        <DiffHeaderFileIcon size="18px" />
                        <DiffHeaderLabel>SQL Changes</DiffHeaderLabel>
                      </DiffHeaderLeft>
                      <DiffHeaderRight>
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
                                <Chat1 size="14px" />
                              ) : (
                                <CheckmarkOutline size="14px" />
                              )}
                            </StatusIcon>
                            {isRejected
                              ? "Rejected"
                              : isRejectedWithFollowUp
                                ? "Follow-up received"
                                : "Accepted"}
                          </DiffHeaderStatus>
                        )}
                        <RunQueryButton
                          skin="transparent"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (message.sql && onRunQuery) {
                              onRunQuery(message.sql)
                            }
                          }}
                          title="Run this query"
                        >
                          {getQueryStatusIcon(queryRunStatus)}
                        </RunQueryButton>
                        <ExpandIcon>
                          <ExpandUpDown />
                        </ExpandIcon>
                      </DiffHeaderRight>
                    </DiffHeader>
                    {isExpanded && (
                      <>
                        <DiffEditorWrapper>
                          <DiffEditor
                            height="100%"
                            language={QuestDBLanguageName}
                            original={previousSQLForDiff}
                            modified={currentSQLForDiff}
                            theme="dracula"
                            options={{
                              lineNumbers: "off",
                              renderIndicators: false,
                              renderOverviewRuler: false,
                              hideCursorInOverviewRuler: true,
                              automaticLayout: true,
                              minimap: { enabled: false },
                              scrollBeyondLastLine: false,
                              readOnly: true,
                              enableSplitViewResizing: false,
                              renderSideBySide: false,
                              originalEditable: false,
                              fontSize: 12,
                              lineHeight: 20,
                            }}
                          />
                          {onExpandDiff && conversationQueryKey && (
                            <ExpandToEditorButton
                              onClick={(e) => {
                                e.stopPropagation()
                                onExpandDiff(
                                  message.previousSQL || "",
                                  message.sql || "",
                                  conversationQueryKey,
                                )
                              }}
                              title="Open in editor"
                            >
                              Open in editor
                            </ExpandToEditorButton>
                          )}
                        </DiffEditorWrapper>
                        {showButtons && hasPendingDiff && (
                          <DiffActions>
                            {showRejectButton && onRejectChange && (
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
                          </DiffActions>
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
