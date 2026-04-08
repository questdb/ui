import React, { memo, useMemo } from "react"
import styled, { keyframes, useTheme } from "styled-components"
import { Box, Text } from "../../../components"
import { AISparkle } from "../../../components/AISparkle"
import { AssistantModesCompact } from "../../../components/AIStatusIndicator/AssistantModesCompact"
import type { ConversationMessage } from "../../../providers/AIConversationProvider/types"
import { AIOperationStatus } from "../../../providers/AIStatusProvider"
import { GaugeIcon } from "@phosphor-icons/react"
import { color } from "../../../utils"
import { AssistantMarkdown } from "./AssistantMarkdown"
import type { OpenInEditorContent } from "./ChatMessages"
import { buildInterleavedTimeline } from "../../../utils/ai/turnView"

function formatTokenCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`
  }
  return count.toString()
}

const Divider = styled.div`
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, #9c274b 0%, rgba(54, 14, 26, 0) 100%);
  margin-bottom: 1rem;
`

const OperationHistoryContainer = styled.div`
  width: 100%;
`

const AssistantHeader = styled(Box).attrs({
  alignItems: "center",
  gap: "1rem",
})`
  width: 100%;
  padding: 1.2rem 0.4rem;
  flex: 1 0 auto;
`

const AssistantLabel = styled(Text).attrs({ className: "assistant-label" })`
  font-size: 1.4rem;
  color: ${color("foreground")};
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
  padding: 0 0.8rem;
  flex-shrink: 0;
  width: 100%;
`

const cursorBlink = keyframes`
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
`

const StreamingCursor = styled.span`
  display: inline-block;
  width: 2px;
  height: 1.4em;
  background: ${color("foreground")};
  margin-left: 2px;
  margin-right: auto;
  vertical-align: text-bottom;
  animation: ${cursorBlink} 1s infinite;
`

type AssistantMessageContentProps = {
  turnMessages: ConversationMessage[]
  anchorMessage: ConversationMessage
  status: AIOperationStatus | null
  isLiveOperation: boolean
  isMessageStreaming: boolean
  onScrollNeeded: () => void
  onOpenInEditor: (
    content: OpenInEditorContent,
    existingQuery?: boolean,
  ) => Promise<void>
}

export const AssistantMessageContent = memo<AssistantMessageContentProps>(
  ({
    turnMessages,
    anchorMessage,
    status,
    isLiveOperation,
    isMessageStreaming,
    onScrollNeeded,
    onOpenInEditor,
  }) => {
    const theme = useTheme()

    const { operationHistory, endTimestamp, timeline } = useMemo(() => {
      const fullHistory = anchorMessage.operationHistory ?? []
      const filteredHistory = fullHistory.filter(
        (op) => op.type !== AIOperationStatus.Aborted,
      )
      const end =
        fullHistory.length > 0
          ? Math.max(...fullHistory.map((entry) => entry.timestamp))
          : undefined
      const hasGeneratingResponseContent = filteredHistory.some(
        (op) =>
          op.type === AIOperationStatus.GeneratingResponse &&
          !!op.content?.trim(),
      )
      return {
        operationHistory: filteredHistory.filter(
          (op) => op.type !== AIOperationStatus.GeneratingResponse,
        ),
        endTimestamp: end,
        timeline: hasGeneratingResponseContent
          ? buildInterleavedTimeline(filteredHistory)
          : null,
      }
    }, [anchorMessage.operationHistory])

    const fallbackContent = useMemo(() => {
      return turnMessages
        .filter(
          (message) =>
            message.role === "assistant" &&
            typeof message.content === "string" &&
            !!message.content,
        )
        .map((message) => message.content as string)
        .join("\n\n")
    }, [turnMessages])

    const hasContent = !!fallbackContent

    const tokenDisplay = useMemo(() => {
      const tokenUsage = anchorMessage.tokenUsage as
        | { inputTokens: number; outputTokens: number }
        | undefined
      if (
        !tokenUsage ||
        typeof tokenUsage.inputTokens !== "number" ||
        typeof tokenUsage.outputTokens !== "number"
      ) {
        return null
      }
      return (
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
    }, [anchorMessage.tokenUsage])

    const header = (
      <AssistantHeader data-hook="assistant-header">
        <AISparkle size={20} variant="filled" />
        <AssistantLabel>{anchorMessage.model || "Assistant"}</AssistantLabel>
        {tokenDisplay && (
          <TokenDisplay className="token-display">
            <GaugeIcon size="16px" color={theme.color.gray2} />
            <Text size="sm" color="gray2">
              {tokenDisplay}
            </Text>
          </TokenDisplay>
        )}
      </AssistantHeader>
    )

    if (timeline && timeline.length > 0) {
      let headerRendered = false

      return (
        <>
          {timeline.map((item, index) => {
            const isLast = index === timeline.length - 1
            if (item.type === "operations") {
              return (
                <React.Fragment key={`ops-${item.timestamp}`}>
                  {index === 0 && <Divider />}
                  <OperationHistoryContainer>
                    <AssistantModesCompact
                      operationHistory={item.operations}
                      status={status}
                      isLive={isLiveOperation && isLast}
                      onScrollNeeded={onScrollNeeded}
                      collapsed={!isLast}
                      endTimestamp={item.endTimestamp}
                    />
                  </OperationHistoryContainer>
                </React.Fragment>
              )
            }
            const showHeader = !headerRendered
            headerRendered = true
            return (
              <React.Fragment key={`content-${item.timestamp}`}>
                {showHeader && header}
                <ExplanationContent>
                  <AssistantMarkdown
                    content={item.content}
                    messageId={anchorMessage.id}
                    onOpenInEditor={onOpenInEditor}
                  />
                </ExplanationContent>
              </React.Fragment>
            )
          })}
          {isMessageStreaming && (
            <StreamingCursor data-hook="streaming-cursor" />
          )}
        </>
      )
    }

    return (
      <>
        {operationHistory.length > 0 && (
          <>
            <Divider />
            <OperationHistoryContainer>
              <AssistantModesCompact
                operationHistory={operationHistory}
                status={status}
                isLive={isLiveOperation}
                onScrollNeeded={onScrollNeeded}
                collapsed={hasContent || !!anchorMessage.error}
                endTimestamp={endTimestamp}
              />
            </OperationHistoryContainer>
          </>
        )}
        {hasContent && (
          <>
            {header}
            <ExplanationContent>
              <AssistantMarkdown
                content={fallbackContent}
                messageId={anchorMessage.id}
                onOpenInEditor={onOpenInEditor}
              />
              {isMessageStreaming && (
                <StreamingCursor data-hook="streaming-cursor" />
              )}
            </ExplanationContent>
          </>
        )}
      </>
    )
  },
  (prev, next) => {
    const prevLast = prev.turnMessages[prev.turnMessages.length - 1]
    const nextLast = next.turnMessages[next.turnMessages.length - 1]
    return (
      prevLast === nextLast &&
      prev.isMessageStreaming === next.isMessageStreaming
    )
  },
)
