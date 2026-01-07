import React, { useState } from "react"
import styled from "styled-components"
import { Button, ButtonProps } from "../../components"
import { FileCopy } from "@styled-icons/remix-line"
import { CheckboxCircle } from "@styled-icons/remix-fill"
import { copyToClipboard } from "../../utils/copyToClipboard"

const StyledButton = styled(Button)`
  padding: 1.2rem 0.6rem;
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
}: {
  text: string
  iconOnly?: boolean
  size?: ButtonProps["size"]
}) => {
  const [copied, setCopied] = useState(false)

  return (
    <StyledButton
      skin="secondary"
      size={size}
      data-hook="copy-value"
      onClick={(e) => {
        void copyToClipboard(text)
        e.stopPropagation()
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      {...(!iconOnly && {
        prefixIcon: <FileCopy size={size === "sm" ? "12px" : "16px"} />,
      })}
    >
      {copied && (
        <StyledCheckboxCircle size={size === "sm" ? "10px" : "14px"} />
      )}
      {iconOnly ? <FileCopy size={size === "sm" ? "12px" : "16px"} /> : "Copy"}
    </StyledButton>
  )
}
