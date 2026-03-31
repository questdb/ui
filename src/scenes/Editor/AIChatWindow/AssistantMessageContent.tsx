import React from "react"
import styled, { keyframes, useTheme } from "styled-components"
import { Box, Text } from "../../../components"
import { AISparkle } from "../../../components/AISparkle"
import { AssistantModesCompact } from "../../../components/AIStatusIndicator/AssistantModesCompact"
import type { ConversationMessage } from "../../../providers/AIConversationProvider/types"
import { getMessageContent } from "../../../providers/AIConversationProvider/messageContent"
import {
  AIOperationStatus,
  type OperationHistory,
} from "../../../providers/AIStatusProvider"
import { GaugeIcon } from "@phosphor-icons/react"
import { color } from "../../../utils"
import { AssistantMarkdown } from "./AssistantMarkdown"
import type { OpenInEditorContent } from "./ChatMessages"
import type { TimelineItem } from "./ChatMessages"

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
  message: ConversationMessage
  operationHistory: OperationHistory | undefined
  hasOperationHistory: boolean
  timeline: TimelineItem[] | null
  status: AIOperationStatus | null
  isLiveOperation: boolean
  isMessageStreaming: boolean
  tokenDisplay: React.ReactNode | null
  onScrollNeeded: () => void
  onOpenInEditor: (
    content: OpenInEditorContent,
    existingQuery?: boolean,
  ) => Promise<void>
}

export const AssistantMessageContent: React.FC<
  AssistantMessageContentProps
> = ({
  message,
  operationHistory,
  hasOperationHistory,
  timeline,
  status,
  isLiveOperation,
  isMessageStreaming,
  tokenDisplay,
  onScrollNeeded,
  onOpenInEditor,
}) => {
  const theme = useTheme()
  const messageContent = getMessageContent(message)
  const hasContent = !!messageContent

  const header = (
    <AssistantHeader data-hook="assistant-header">
      <AISparkle size={20} variant="filled" />
      <AssistantLabel>{message.model || "Assistant"}</AssistantLabel>
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

  if (timeline) {
    let headerRendered = false
    return (
      <>
        {timeline.map((item, idx) => {
          const isLast = idx === timeline.length - 1
          if (item.type === "operations") {
            return (
              <React.Fragment key={`ops-${item.timestamp}`}>
                {idx === 0 && <Divider />}
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
                  messageId={message.id}
                  onOpenInEditor={onOpenInEditor}
                />
              </ExplanationContent>
            </React.Fragment>
          )
        })}
        {isMessageStreaming && <StreamingCursor data-hook="streaming-cursor" />}
      </>
    )
  }

  return (
    <>
      {hasOperationHistory && operationHistory && (
        <>
          <Divider />
          <OperationHistoryContainer>
            <AssistantModesCompact
              operationHistory={operationHistory}
              status={status}
              isLive={isLiveOperation}
              onScrollNeeded={onScrollNeeded}
              collapsed={hasContent || !!message.error}
            />
          </OperationHistoryContainer>
        </>
      )}
      {hasContent && (
        <>
          {header}
          <ExplanationContent>
            <AssistantMarkdown
              content={messageContent}
              messageId={message.id}
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
}
