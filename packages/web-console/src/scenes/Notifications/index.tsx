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
import { useDispatch, useSelector } from "react-redux"
import styled from "styled-components"
import {
  Button,
  PaneContent,
  PaneMenu,
  PaneWrapper,
  Text,
  useScreenSize,
} from "../../components"
import { actions, selectors } from "../../store"
import { TerminalBox, Subtract, ArrowUpS } from "@styled-icons/remix-line"
import Notification from "./Notification"
import { NotificationType } from "../../store/Query/types"
import { useEditor } from "../../providers"

const Wrapper = styled(PaneWrapper)<{ minimized: boolean }>`
  flex: ${(props) => (props.minimized ? "initial" : "1")};
  overflow: auto;
  max-height: 35rem;
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

const Notifications = ({ onClearNotifications }: { onClearNotifications: (bufferId: number) => void }) => {
  const { activeBuffer } = useEditor()
  const notifications = useSelector(selectors.query.getNotifications)
  const queryNotifications = useSelector(selectors.query.getQueryNotificationsForBuffer(activeBuffer.id as number)) || {}
  const activeNotification = useSelector(selectors.query.getActiveNotification)
  const { sm } = useScreenSize()
  const [isMinimized, setIsMinimized] = useState(true)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const dispatch = useDispatch()

  const bufferNotifications = notifications.filter(notification => queryNotifications[notification.query])

  const scrollToBottom = () => {
    contentRef.current?.scrollTo({
      top: contentRef.current?.scrollHeight,
    })
  }

  const toggleMinimized = useCallback(() => {
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
            <Notification isMinimized={true} {...activeNotification} />
          )}
        </LatestNotification>
        {(bufferNotifications.length > 0 || !isMinimized) &&(
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
                onClick={() => onClearNotifications(activeBuffer.id as number)}
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
