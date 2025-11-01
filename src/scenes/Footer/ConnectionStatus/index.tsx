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
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background-color: ${(props) =>
    props.isConnected ? color("green") : color("red")};
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
        <Text color="white">Connected</Text>
      ) : (
        <Text color="white">Error connecting to QuestDB</Text>
      )}
    </Wrapper>
  )
}

export default ConnectionStatus
