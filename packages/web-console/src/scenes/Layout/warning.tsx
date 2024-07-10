import React, { useEffect, useState } from "react"
import styled from "styled-components"
import { Box } from "@questdb/react-components"
import { useSettings } from "../../providers/SettingsProvider"
import { Close, ErrorWarning, ExternalLink } from "@styled-icons/remix-line"
import { errorWorkarounds } from "../../utils/errorWorkarounds"
import { ErrorTag } from "utils"

const WarningRoot = styled(Box).attrs({
  align: "center",
  justifyContent: "space-between",
})`
  width: 100%;
  height: 4rem;
  background: #f8a24d;
  color: #000;
`

const Content = styled(Box).attrs({ gap: "0.5rem" })`
  padding: 0 1.5rem;
`

const CloseButton = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  border: 0;
  cursor: pointer;
  width: 4.5rem;
  height: 4.5rem;
`

const WarningText = styled.span`
  font-weight: 600;
`

const WorkaroundLink = styled.a`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: 0.5rem;
  color: #000;

  &:hover {
    text-decoration: none;
  }
`

const CloseIcon = styled(Close)`
  color: #000;
`

export const Warnings = () => {
  const { warnings } = useSettings()
  const [open, setOpen] = useState<ErrorTag[] | undefined>(undefined)

  useEffect(() => {
    if (warnings && warnings.length > 0) {
      setOpen(warnings.map((warning) => warning.tag))
    }
  }, [warnings])

  if (!open) return null

  return (
    <Box flexDirection="column" gap="0.1rem" style={{ width: "100%" }}>
      {warnings
        .filter((warning) => open.includes(warning.tag))
        .map((warning, index) => (
          <WarningRoot key={index}>
            <Content>
              <ErrorWarning size="20px" />
              Warning: <WarningText>{warning.warning}</WarningText>
              {errorWorkarounds[warning.tag] && (
                <WorkaroundLink
                  href={errorWorkarounds[warning.tag].link}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  <ExternalLink size="16px" />
                  {errorWorkarounds[warning.tag].title}
                </WorkaroundLink>
              )}
            </Content>
            <CloseButton
              onClick={() =>
                setOpen(open.filter((errorTag) => errorTag !== warning.tag))
              }
            >
              <CloseIcon size="20px" />
            </CloseButton>
          </WarningRoot>
        ))}
    </Box>
  )
}
