import React, { useEffect, useState } from "react"
import styled from "styled-components"
import { Box } from "@questdb/react-components"
import { useContext } from "react"
import { QuestContext } from "../../providers"
import { Close, ErrorWarning, ExternalLink } from "@styled-icons/remix-line"
import * as QuestDB from "../../utils/questdb"

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
  const { warning, warningTag } = useContext(QuestContext)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (warning && warningTag) {
      setOpen(true)
    }
  }, [warning, warningTag])

  if (!open || !warning || !warningTag) return null

  return (
    <Root>
      <Content>
        <ErrorWarning size="20px" />
        Warning: Detected a configuration issue.{" "}
        <WarningText>{warning}</WarningText>
        {QuestDB.errorWorkarounds[warningTag] && (
          <WorkaroundLink
            href={QuestDB.errorWorkarounds[warningTag].link}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size="16px" />
            {QuestDB.errorWorkarounds[warningTag].title}
          </WorkaroundLink>
        )}
      </Content>
      <CloseButton onClick={() => setOpen(false)}>
        <CloseIcon size="20px" />
      </CloseButton>
    </Root>
  )
}
