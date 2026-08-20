import React, { useState, useEffect } from "react"
import styled from "styled-components"
import { color } from "../../../utils"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"

const Wrapper = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.9rem;
  min-width: 0;
`

const StatusIcon = styled.div<{ isConnected: boolean }>`
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 999px;
  background-color: ${(props) =>
    props.isConnected ? color("statusSuccess") : color("statusDanger")};
  box-shadow:
    0 0 0 3px
      ${(props) =>
        props.isConnected
          ? props.theme.color.statusSuccessSurface
          : props.theme.color.statusDangerSurface},
    0 0 12px
      ${(props) =>
        props.isConnected
          ? props.theme.color.statusSuccessBorder
          : props.theme.color.statusDangerBorder};
  flex-shrink: 0;
`

const StatusText = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.7rem;
  min-width: 0;
`

const Product = styled.span`
  color: ${({ theme }) => theme.color.contentPrimary};
  font-weight: 600;
  font-size: 1.3rem;
`

const State = styled.span<{ isConnected: boolean }>`
  color: ${({ isConnected, theme }) =>
    isConnected ? theme.color.contentSecondary : theme.color.statusDanger};
  font-size: 1.25rem;
  white-space: nowrap;
`

const ConnectionStatus = () => {
  const [isConnected, setIsConnected] = useState<boolean>(true)
  useEffect(() => {
    const handleConnected = () => setIsConnected(true)
    const handleConnectionError = () => setIsConnected(false)

    eventBus.subscribe(EventType.MSG_CONNECTION_OK, handleConnected)
    eventBus.subscribe(EventType.MSG_CONNECTION_ERROR, handleConnectionError)
    return () => {
      eventBus.unsubscribe(EventType.MSG_CONNECTION_OK, handleConnected)
      eventBus.unsubscribe(
        EventType.MSG_CONNECTION_ERROR,
        handleConnectionError,
      )
    }
  }, [])

  return (
    <Wrapper>
      <StatusIcon isConnected={isConnected} />
      <StatusText>
        <Product>QuestDB</Product>
        <State isConnected={isConnected}>
          {isConnected ? "Connected" : "Connection unavailable"}
        </State>
      </StatusText>
    </Wrapper>
  )
}

export default ConnectionStatus
