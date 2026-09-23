import React, { useState, useEffect } from "react"
import styled from "styled-components"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"

const Wrapper = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.9rem;
  min-width: 0;
`

const StatusIcon = styled.svg<{ $ok: boolean }>`
  width: 0.9rem;
  height: 0.9rem;
  flex-shrink: 0;
  color: ${({ $ok, theme }) =>
    $ok ? theme.color.statusSuccess : theme.color.statusDanger};
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
      <StatusIcon
        $ok={isConnected}
        viewBox="0 0 1 1"
        fill="currentColor"
        preserveAspectRatio="none"
        aria-hidden
      >
        <rect
          x="0.1"
          y="0.1"
          width="0.8"
          height="0.8"
          rx="0.15"
          fill="currentColor"
        />
        <rect
          x="0.05"
          y="0.05"
          width="0.9"
          height="0.9"
          rx="0.15"
          stroke="currentColor"
          strokeOpacity="0.32"
          strokeWidth="0.1"
          fill="none"
        />
      </StatusIcon>
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
