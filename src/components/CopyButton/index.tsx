import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { Button, type ButtonProps } from "../Button"
import { Check, FileCopy } from "../icons"
import { copyToClipboard } from "../../utils/copyToClipboard"

const StyledButton = styled(Button)`
  padding: 1.2rem 0.6rem;
  position: relative;
`

const CopiedIndicator = styled.span<{ $size: string }>`
  position: absolute;
  top: 0;
  right: 0;
  transform: translate(50%, -50%);
  display: inline-flex;
  width: ${({ $size }) => $size};
  height: ${({ $size }) => $size};
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: ${({ theme }) => theme.color.statusSuccess};
  color: ${({ theme }) => theme.color.controlSurface};
  pointer-events: none;
`

export const CopyButton = ({
  text,
  iconOnly,
  icon,
  size = "md",
  copiedMode = "badge",
  onCopy,
  ...props
}: {
  text: string
  iconOnly?: boolean
  icon?: React.ReactNode
  size?: ButtonProps["size"]
  copiedMode?: "badge" | "replace"
  onCopy?: () => void
} & ButtonProps) => {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const displayIcon = icon ?? (
    <FileCopy size={size === "sm" ? "12px" : "16px"} />
  )

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <StyledButton
      variant="secondary"
      size={size}
      data-hook="copy-value"
      data-copied={copied || undefined}
      title="Copy to clipboard"
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        void copyToClipboard(text)
        e.stopPropagation()
        setCopied(true)
        timeoutRef.current = setTimeout(() => setCopied(false), 2000)
        onCopy?.()
      }}
      {...(!iconOnly && { prefixIcon: displayIcon })}
      {...props}
    >
      {copied && copiedMode === "badge" && (
        <CopiedIndicator
          data-copy-check
          $size={size === "sm" ? "10px" : "14px"}
        >
          <Check
            aria-hidden
            weight="bold"
            size={size === "sm" ? "7px" : "10px"}
          />
        </CopiedIndicator>
      )}
      {iconOnly ? (
        copied && copiedMode === "replace" ? (
          <Check
            data-copy-check
            color="currentColor"
            weight="bold"
            size={size === "sm" ? "12px" : "16px"}
          />
        ) : (
          displayIcon
        )
      ) : (
        "Copy"
      )}
    </StyledButton>
  )
}
