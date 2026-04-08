/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Copyright (c) 2014-2019 Appsicle
 *  Copyright (c) 2019-2022 QuestDB
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 ******************************************************************************/

import React, {
  useCallback,
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
} from "react"
import { useSelector } from "react-redux"
import styled from "styled-components"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import {
  Button,
  PaneContent,
  PaneMenu,
  PaneWrapper,
  Text,
} from "../../components"
import { useScreenSize } from "../../hooks"
import { selectors } from "../../store"
import { TerminalBox, Subtract, ArrowUpS } from "@styled-icons/remix-line"
import Notification from "./Notification"
import { NotificationType } from "../../store/Query/types"
import type { NotificationNamespaceKey } from "../../store/Query/types"
import { useEditor } from "../../providers"

const Wrapper = styled(PaneWrapper)<{ minimized: boolean }>`
  flex: ${(props) => (props.minimized ? "initial" : "1")};
  overflow: auto;
  max-height: 35rem;
  min-height: ${(props) => (props.minimized ? "auto" : "10rem")};
  background: ${({ theme }) => theme.color.backgroundLighter};
`

const Menu = styled(PaneMenu)`
  justify-content: space-between;
  overflow: hidden;
  border: 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);

  ::before {
    content: "";
    position: absolute;
    top: 0;
    cursor: text;
    left: 0;
    width: 100%;
    height: 2px;
    background: ${({ theme }) => theme.color.backgroundDarker};
  }
`

const Content = styled(PaneContent)<{ minimized: boolean }>`
  overflow: ${(props) => (props.minimized ? "hidden" : "auto")};
  overflow-x: hidden;
  height: ${(props) => (props.minimized ? "4rem" : "100%")};
`

const Header = styled(Text)`
  display: flex;
  align-items: center;
`

const LatestNotification = styled.div`
  padding: 0 1rem;
  flex: 1;
  height: 100%;
  display: flex;
  cursor: text;
  align-items: stretch;
  width: calc(100% - 10rem);
`

const TerminalBoxIcon = styled(TerminalBox)`
  margin-right: 1rem;
`

const ClearAllNotifications = styled.div`
  display: flex;
  width: 100%;
  height: 4.5rem;
  justify-content: center;
  padding: 0.5rem 1rem;
  margin-top: auto;
  align-items: center;
  flex-shrink: 0;
`

const Notifications = ({
  onClearNotifications,
  targetBufferId: targetBufferIdOverride,
}: {
  onClearNotifications: (bufferId: NotificationNamespaceKey) => void
  targetBufferId?: NotificationNamespaceKey
}) => {
  const { activeBuffer } = useEditor()
  const notifications = useSelector(selectors.query.getNotifications)

  const bufferIdKey = activeBuffer.id as number
  const bufferQueryNotifications =
    useSelector(selectors.query.getQueryNotificationsForBuffer(bufferIdKey)) ||
    {}
  const overrideQueryNotifications =
    useSelector(
      selectors.query.getQueryNotificationsForBuffer(
        targetBufferIdOverride ?? bufferIdKey,
      ),
    ) || {}
  const activeNotification = useSelector(selectors.query.getActiveNotification)
  const { sm } = useScreenSize()
  const [isMinimized, setIsMinimized] = useState(true)
  const contentRef = useRef<HTMLDivElement | null>(null)

  // Show notifications that match either the buffer or override namespace,
  // or match the activeNotification (covers in-flight queries)
  const bufferNotifications = notifications.filter((notification) => {
    if (bufferQueryNotifications[notification.query]) {
      return true
    }
    if (overrideQueryNotifications[notification.query]) {
      return true
    }
    if (
      activeNotification &&
      notification.query === activeNotification.query &&
      notification.createdAt?.getTime() ===
        activeNotification.createdAt?.getTime()
    ) {
      return true
    }
    return false
  })

  const scrollToBottom = () => {
    contentRef.current?.scrollTo({
      top: contentRef.current?.scrollHeight,
    })
  }

  const toggleMinimized = useCallback(() => {
    if (isMinimized) {
      void trackEvent(ConsoleEvent.QUERY_LOG_OPEN)
    }
    setIsMinimized(!isMinimized)
  }, [isMinimized])

  useLayoutEffect(() => {
    if (bufferNotifications.length > 0) {
      scrollToBottom()
    }
  }, [bufferNotifications])

  useLayoutEffect(() => {
    scrollToBottom()
  }, [isMinimized])

  useEffect(() => {
    if (sm) {
      setIsMinimized(true)
    }
  }, [sm])

  return (
    <Wrapper minimized={isMinimized} data-hook="notifications-wrapper">
      <Menu>
        <Header color="foreground">
          <TerminalBoxIcon size="18px" />
          Log
        </Header>
        <LatestNotification data-hook="notifications-collapsed">
          {isMinimized && activeNotification && (
            <Notification isMinimized {...activeNotification} />
          )}
        </LatestNotification>
        {(bufferNotifications.length > 0 || !isMinimized) && (
          <Button
            skin={`${isMinimized ? "secondary" : "transparent"}`}
            onClick={toggleMinimized}
            data-hook={`${isMinimized ? "expand-notifications" : "collapse-notifications"}`}
          >
            {isMinimized ? <ArrowUpS size="18px" /> : <Subtract size="18px" />}
          </Button>
        )}
      </Menu>
      {!isMinimized && (
        <Content
          minimized={isMinimized}
          ref={contentRef}
          data-hook="notifications-expanded"
        >
          {bufferNotifications
            .filter(
              (notification) => notification.type !== NotificationType.LOADING,
            )
            .map((notification) => (
              <Notification
                isMinimized={false}
                key={
                  notification.createdAt ? notification.createdAt.getTime() : 0
                }
                {...notification}
              />
            ))}
          {!isMinimized && (
            <ClearAllNotifications>
              <Button
                skin="secondary"
                disabled={bufferNotifications.length === 0}
                onClick={() => {
                  void trackEvent(ConsoleEvent.QUERY_LOG_CLEAR)
                  onClearNotifications(bufferIdKey)
                  if (
                    targetBufferIdOverride !== undefined &&
                    targetBufferIdOverride !== bufferIdKey
                  ) {
                    onClearNotifications(targetBufferIdOverride)
                  }
                }}
              >
                Clear query log
              </Button>
            </ClearAllNotifications>
          )}
        </Content>
      )}
    </Wrapper>
  )
}

export default Notifications
