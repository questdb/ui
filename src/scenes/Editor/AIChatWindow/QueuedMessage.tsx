import React from "react"
import styled from "styled-components"
import { ArrowBendDownRightIcon, XIcon } from "@phosphor-icons/react"
import { IconButton } from "../../../components"
import { TextButton } from "../../../components/TextButton"
import { ctrlCmd } from "../../../utils/platform"

const Root = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
  padding: 0.4rem 0.4rem 0.4rem 1.2rem;
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  border-radius: 0.6rem;
  background: ${({ theme }) => theme.color.surfaceInset};
  font-size: 1.3rem;
  line-height: 1.6rem;
`

const Marker = styled(ArrowBendDownRightIcon)`
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.contentMuted};
`

const Copy = styled.span`
  display: flex;
  align-items: baseline;
  gap: 0.8rem;
  flex: 1;
  min-width: 0;
`

const Label = styled.span`
  flex-shrink: 0;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentMuted};
`

const Shortcut = styled.span`
  margin-left: 0.6rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.contentMuted};
`

const Text = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ theme }) => theme.color.contentPrimary};
`

type QueuedMessageProps = {
  text: string
  imageCount?: number
  onSendNow?: () => void
  sendNowDisabled: boolean
  onRemove: () => void
}

// A message the user wrote while the assistant was answering. It is sent when
// the answer ends; Send now stops the answer and sends it right away.
export const QueuedMessage = ({
  text,
  imageCount = 0,
  onSendNow,
  sendNowDisabled,
  onRemove,
}: QueuedMessageProps) => (
  <Root role="status" data-hook="chat-queued-message">
    <Marker size={14} aria-hidden="true" />
    <Copy>
      <Label>Queued</Label>
      <Text title={text} data-hook="chat-queued-message-text">
        {[
          text,
          imageCount > 0 && `${imageCount} image${imageCount === 1 ? "" : "s"}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
    </Copy>
    {onSendNow && (
      <TextButton
        onClick={onSendNow}
        disabled={sendNowDisabled}
        title={`Stop the answer and send this now (${ctrlCmd}+Enter)`}
        data-hook="chat-queued-send-now"
      >
        Send now
        <Shortcut aria-hidden="true">{ctrlCmd} ↵</Shortcut>
      </TextButton>
    )}
    <IconButton
      label="Remove queued message"
      size="sm"
      onClick={onRemove}
      data-hook="chat-queued-remove"
    >
      <XIcon size={14} />
    </IconButton>
  </Root>
)
