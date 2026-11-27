import React from "react"
import styled from "styled-components"
import { CopyableCommand } from "../../Footer/MCPBridgeStatus/CopyableCommand"
import { chatErrorPartsOf } from "./chatErrorParts"

const Body = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
`

// An error in the chat; a command in it is shown like every other command,
// to copy as one line.
export const ChatErrorText = ({ error }: { error: string }) => {
  const { text, command } = chatErrorPartsOf(error)
  if (!command) return <>{error}</>
  return (
    <Body>
      <span>{text}</span>
      <CopyableCommand command={command} />
    </Body>
  )
}
