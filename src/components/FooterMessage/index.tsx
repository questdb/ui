import React, { useState } from "react"
import styled from "styled-components"
import { Text, Tooltip } from ".."
import type { Color } from "types"

const Message = styled.span`
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

type Props = {
  message: string | null
  color: Color
}

export const FooterMessage = ({ message, color }: Props) => {
  const [hovered, setHovered] = useState(false)
  const [truncated, setTruncated] = useState(false)

  const measureTruncation = (element: HTMLElement) =>
    setTruncated(element.scrollWidth > element.clientWidth)

  return (
    <Tooltip
      content={message}
      placement="top"
      open={hovered && truncated}
      onOpenChange={setHovered}
    >
      <Message
        onPointerEnter={(e) => measureTruncation(e.currentTarget)}
        data-hook="variables-footer-message"
      >
        <Text color={color} size="sm">
          {message}
        </Text>
      </Message>
    </Tooltip>
  )
}
