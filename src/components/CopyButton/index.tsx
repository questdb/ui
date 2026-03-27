import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { Button, type ButtonProps } from "../Button"
import { FileCopy } from "@styled-icons/remix-line"
import { CheckboxCircle } from "@styled-icons/remix-fill"
import { copyToClipboard } from "../../utils/copyToClipboard"

const StyledButton = styled(Button)`
  padding: 1.2rem 0.6rem;
  position: relative;
`

const StyledCheckboxCircle = styled(CheckboxCircle)`
  position: absolute;
  transform: translate(75%, -75%);
  color: ${({ theme }) => theme.color.green};
`

export const CopyButton = ({
  text,
  iconOnly,
  size = "md",
  ...props
}: {
  text: string
  iconOnly?: boolean
  size?: ButtonProps["size"]
} & ButtonProps) => {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <StyledButton
      skin="secondary"
      size={size}
      data-hook="copy-value"
      title="Copy to clipboard"
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        void copyToClipboard(text)
        e.stopPropagation()
        setCopied(true)
        timeoutRef.current = setTimeout(() => setCopied(false), 2000)
      }}
      {...(!iconOnly && {
        prefixIcon: <FileCopy size={size === "sm" ? "12px" : "16px"} />,
      })}
      {...props}
    >
      {copied && (
        <StyledCheckboxCircle size={size === "sm" ? "10px" : "14px"} />
      )}
      {iconOnly ? <FileCopy size={size === "sm" ? "12px" : "16px"} /> : "Copy"}
    </StyledButton>
  )
}
