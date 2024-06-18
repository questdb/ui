import React, { useEffect, useState } from "react"
import styled from "styled-components"
import { Box } from "@questdb/react-components"
import { useContext } from "react"
import { QuestContext } from "../../providers"
import { Close, ErrorWarning, ExternalLink } from "@styled-icons/remix-line"

const Root = styled(Box).attrs({
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
  margin-left: auto;
  margin-right: auto;
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

  &:hover {
    text-decoration: underline;
  }
`

const CloseIcon = styled(Close)`
  color: #000;
`

export const Warning = () => {
  const { warning, tag } = useContext(QuestContext)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (warning && tag) {
      setOpen(true)
    }
  }, [warning, tag])

  if (!open) return null

  return (
    <Root>
      <Content>
        <ErrorWarning size="20px" />
        Warning: Detected a configuration issue.{" "}
        <WarningText>
          Please, increase max open file handlers OS limit!
        </WarningText>
        <WorkaroundLink>
          <ExternalLink size="16px" />
          System limit for open files
        </WorkaroundLink>
      </Content>
      <CloseButton onClick={() => setOpen(false)}>
        <CloseIcon size="20px" />
      </CloseButton>
    </Root>
  )
}
