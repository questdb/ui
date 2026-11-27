import React, { memo, useMemo } from "react"
import styled, { keyframes } from "styled-components"
import { CopyButton } from "../../../components"
import { AssistantModesCompact } from "../../../components/AIStatusIndicator/AssistantModesCompact"
import type { ConversationMessage } from "../../../providers/AIConversationProvider/types"
import { AIOperationStatus } from "../../../providers/AIStatusProvider"
import { color } from "../../../utils"
import { AssistantMarkdown } from "./AssistantMarkdown"
import { QuestionRecord } from "./QuestionRecord"
import { NoticeRecord } from "./NoticeRecord"
import type { OpenInEditorContent } from "./ChatMessages"
import {
  buildInterleavedTimeline,
  withResponseTexts,
} from "../../../utils/ai/turnView"
import {
  WORKING_AFTER_MS,
  WorkingIndicator,
  useQuietFor,
} from "./WorkingIndicator"

const OperationHistoryContainer = styled.div`
  width: 100%;
`

const ExplanationContent = styled.div<{ $withCopyGutter: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  padding-inline: 0.8rem
    ${({ $withCopyGutter }) => ($withCopyGutter ? "3.6rem" : "0.8rem")};
  flex-shrink: 0;
  width: 100%;
`

// Keep Copy beside the first line without making a short reply taller.
const ResponseActions = styled.div.attrs({ className: "response-actions" })`
  position: absolute;
  inset-block-start: -0.4rem;
  inset-inline-end: 0.4rem;
`

const cursorBlink = keyframes`
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
`

const StreamingCursor = styled.span`
  display: inline-block;
  width: 2px;
  height: 1.4em;
  background: ${color("contentPrimary")};
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
    // A live answer shows a spinning step, or its text as it streams. When
    // neither moves for a moment, like after a failed step, between tool
    // rounds or after the user answered a question, "Working" shows.
    const lastStep = anchorMessage.operationHistory?.at(-1)
    const hasActiveStep =
      !!status &&
      status !== AIOperationStatus.GeneratingResponse &&
      status !== AIOperationStatus.Aborted &&
      lastStep?.type === status &&
      lastStep.args?.failed === undefined &&
      lastStep.endedAt === undefined
    const mayShowWorking = isLiveOperation && !hasActiveStep

    const fullHistory = useMemo(
      () =>
        withResponseTexts(anchorMessage.operationHistory ?? [], turnMessages),
      [anchorMessage.operationHistory, turnMessages],
    )
    const { operationHistory, endTimestamp, timeline } = useMemo(() => {
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
          (!!op.transcriptBlock || !!op.content?.trim()),
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
    }, [fullHistory])

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

    const activity = `${fallbackContent.length}:${fullHistory.length}:${
      fullHistory[fullHistory.length - 1]?.content?.length ?? 0
    }`
    const showWorking = useQuietFor(activity, mayShowWorking, WORKING_AFTER_MS)
    const showStreamingCursor =
      isMessageStreaming &&
      status === AIOperationStatus.GeneratingResponse &&
      !showWorking

    // Copies the answer as Markdown, once it has finished.
    const responseActions =
      hasContent && !isMessageStreaming && !isLiveOperation ? (
        <ResponseActions>
          <CopyButton
            text={fallbackContent}
            iconOnly
            size="sm"
            variant="ghost"
            copiedMode="replace"
            aria-label="Copy response"
            title="Copy response"
            data-hook="chat-response-copy"
          />
        </ResponseActions>
      ) : null

    if (timeline && timeline.length > 0) {
      const firstContentIndex = timeline.findIndex(
        (item) => item.type !== "operations",
      )

      return (
        <>
          {timeline.map((item, index) => {
            const isLast = index === timeline.length - 1
            if (item.type === "operations") {
              return (
                <OperationHistoryContainer key={`ops-${item.timestamp}`}>
                  <AssistantModesCompact
                    operationHistory={item.operations}
                    status={status}
                    isLive={isLiveOperation && isLast}
                    onScrollNeeded={onScrollNeeded}
                    collapsed={!isLast}
                    endTimestamp={
                      item.endTimestamp ?? (isLast ? endTimestamp : undefined)
                    }
                  />
                </OperationHistoryContainer>
              )
            }
            const isFirstContent = index === firstContentIndex
            return (
              <ExplanationContent
                // Ordered stream segments can share a timestamp within one websocket tick.
                // eslint-disable-next-line react/no-array-index-key
                key={`content-${item.timestamp}-${index}`}
                $withCopyGutter={isFirstContent}
                data-hook="chat-response-content"
              >
                {item.type === "content" ? (
                  <AssistantMarkdown
                    content={item.content}
                    messageId={anchorMessage.id}
                    onOpenInEditor={onOpenInEditor}
                  />
                ) : item.block.kind === "question" ? (
                  <QuestionRecord record={item.block.record} />
                ) : (
                  <NoticeRecord notice={item.block.notice} />
                )}
                {isFirstContent && responseActions}
              </ExplanationContent>
            )
          })}
          {showStreamingCursor && (
            <StreamingCursor data-hook="streaming-cursor" />
          )}
          {showWorking && <WorkingIndicator />}
        </>
      )
    }

    return (
      <>
        {operationHistory.length > 0 && (
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
        )}
        {hasContent && (
          <ExplanationContent $withCopyGutter data-hook="chat-response-content">
            <AssistantMarkdown
              content={fallbackContent}
              messageId={anchorMessage.id}
              onOpenInEditor={onOpenInEditor}
            />
            {showStreamingCursor && (
              <StreamingCursor data-hook="streaming-cursor" />
            )}
            {responseActions}
          </ExplanationContent>
        )}
        {showWorking && <WorkingIndicator />}
      </>
    )
  },
  (prev, next) => {
    const prevLast = prev.turnMessages[prev.turnMessages.length - 1]
    const nextLast = next.turnMessages[next.turnMessages.length - 1]
    return (
      prevLast === nextLast &&
      prev.anchorMessage === next.anchorMessage &&
      prev.status === next.status &&
      prev.isLiveOperation === next.isLiveOperation &&
      prev.isMessageStreaming === next.isMessageStreaming
    )
  },
)
