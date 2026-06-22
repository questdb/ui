import React, { useState, useEffect } from "react"
import styled from "styled-components"
import { color } from "../../../utils"
import { Text } from "../../../components"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"

const Wrapper = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;
`

const StatusIcon = styled.div<{ isConnected: boolean }>`
  display: block;
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 0.2rem;
  background-color: ${(props) =>
    props.isConnected ? color("green") : color("red")};
  box-shadow: 0 0 0 1.5px
    ${(props) =>
      props.isConnected
        ? "rgba(80, 250, 123, 0.32)"
        : "rgba(255, 85, 85, 0.32)"};
  margin-right: 0.6rem;
`

const ConnectionStatus = () => {
  const [isConnected, setIsConnected] = useState<boolean>(true)
  useEffect(() => {
    eventBus.subscribe(EventType.MSG_CONNECTION_OK, () => {
      setIsConnected(true)
    })

    eventBus.subscribe(EventType.MSG_CONNECTION_ERROR, () => {
      setIsConnected(false)
    })
  }, [isConnected])

  return (
    <Wrapper>
      <StatusIcon isConnected={isConnected} />
      {isConnected ? (
        <Text color="white">QuestDB Connected</Text>
      ) : (
        <Text color="white">Error connecting to QuestDB</Text>
      )}
    </Wrapper>
  )
}

export default ConnectionStatus
