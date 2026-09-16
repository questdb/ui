import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { Box } from "../Box"
import { CopyButton } from "../CopyButton"
import { textStyles } from "../Text"
import { Tooltip } from "../Tooltip"

type Props = {
  children: string
  className?: string
  "data-hook"?: string
}

const Label = styled.span.attrs({ ellipsis: true })`
  ${textStyles}
  display: block;
  min-width: 0;
  max-width: 100%;
`

const FullText = styled.span`
  min-width: 0;
  overflow-wrap: anywhere;
`

const CopyValue = styled(CopyButton)`
  flex-shrink: 0;
`

export const TruncatedText = ({ children, ...props }: Props) => {
  const ref = useRef<HTMLSpanElement>(null)
  const [truncated, setTruncated] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      setTruncated(element.scrollWidth > element.clientWidth)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [children])

  return (
    <Tooltip
      content={
        <Box gap="1rem" align="center">
          <FullText>{children}</FullText>
          <CopyValue
            text={children}
            iconOnly
            size="sm"
            aria-label="Copy full value"
          />
        </Box>
      }
      open={truncated && open}
      onOpenChange={setOpen}
    >
      <Label {...props} ref={ref} tabIndex={truncated ? 0 : undefined}>
        {children}
      </Label>
    </Tooltip>
  )
}
