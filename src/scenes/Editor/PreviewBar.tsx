import React from "react"
import styled from "styled-components"
import { EyeIcon, PushPinIcon, XIcon } from "@phosphor-icons/react"
import { Box, Button, Text } from "../../components"
import { useEditor } from "../../providers"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"

const Root = styled(Box).attrs({
  align: "center",
  justifyContent: "space-between",
})`
  flex-shrink: 0;
  width: 100%;
  min-height: 4.4rem;
  padding: 0.6rem 1.4rem 0.6rem 2rem;
  gap: 1rem;
  background: ${({ theme }) => theme.color.statusInfoSurface};
  border-bottom: 1px solid ${({ theme }) => theme.color.borderSubtle};
`

const Message = styled(Box).attrs({ align: "center", gap: "0.8rem" })`
  min-width: 0;
  color: ${({ theme }) => theme.color.statusInfo};
`

const KEEP_OPEN_HOOK = "tab-preview-keep-open"

// Moves focus to the preview's "Keep open" button. The bar renders with the
// preview, so it is there once the preview is active; a frame later at most.
export const focusPreviewKeepOpen = () => {
  const focus = () => {
    const button = document.querySelector<HTMLElement>(
      `[data-hook="${KEEP_OPEN_HOOK}"]`,
    )
    button?.focus()
    return button !== null
  }
  if (!focus()) requestAnimationFrame(focus)
}

export const PreviewBar = () => {
  const { activeBuffer, keepBufferOpen, discardPreview } = useEditor()

  const keepOpen = () => {
    void trackEvent(ConsoleEvent.TAB_PREVIEW_KEEP_OPEN)
    void keepBufferOpen(activeBuffer.id as number)
  }

  const close = () => {
    void trackEvent(ConsoleEvent.TAB_PREVIEW_CLOSE)
    void discardPreview()
  }

  return (
    <Root data-hook="tab-preview-bar">
      <Message>
        <EyeIcon size={16} />
        <Text color="contentPrimary" ellipsis>
          Preview of a closed tab. Keep it open to make changes.
        </Text>
      </Message>
      <Box align="center" gap="0.6rem">
        <Button
          size="sm"
          variant="primary"
          prefixIcon={<PushPinIcon size={14} />}
          data-hook={KEEP_OPEN_HOOK}
          onClick={keepOpen}
        >
          Keep open
        </Button>
        <Button
          size="sm"
          variant="ghost"
          prefixIcon={<XIcon size={14} />}
          data-hook="tab-preview-close"
          onClick={close}
        >
          Close
        </Button>
      </Box>
    </Root>
  )
}
