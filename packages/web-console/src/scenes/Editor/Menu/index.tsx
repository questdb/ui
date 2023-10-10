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
import React from "react"
import { useCallback, useEffect, useState, useContext } from "react"
import { useDispatch, useSelector } from "react-redux"
import { CSSTransition } from "react-transition-group"
import styled from "styled-components"
import {
  Add,
  Chat3,
  Close as _CloseIcon,
  Command,
  Play,
  Stop,
  Question,
} from "@styled-icons/remix-line"
import { Menu as _MenuIcon } from "@styled-icons/remix-fill"
import { Slack } from "@styled-icons/boxicons-logos"

import {
  ErrorButton,
  Link,
  PaneMenu,
  PopperToggle,
  PrimaryToggleButton,
  SecondaryButton,
  SuccessButton,
  Text,
  toast,
  TransitionDuration,
  TransparentButton,
  useKeyPress,
  useScreenSize,
} from "../../../components"
import { Button, DropdownMenu, FeedbackDialog } from "@questdb/react-components"
import { actions, selectors } from "../../../store"
import { color } from "../../../utils"
import QueryPicker from "../QueryPicker"
import { Shortcuts } from "../Shortcuts"
import { useLocalStorage } from "../../../providers/LocalStorageProvider"
import { StoreKey } from "../../../utils/localStorage/types"
import { QuestContext } from "../../../providers"
import { DocSearch } from "@docsearch/react"
import { BUTTON_ICON_SIZE } from "../../../consts/index"

import "@docsearch/css"

const Wrapper = styled(PaneMenu)<{ _display: string }>`
  width: 100%;
  background: transparent;
  z-index: 15;
  padding-right: 0;

  .algolia-autocomplete {
    display: ${({ _display }) => _display} !important;
    flex: 0 1 168px;
  }
`

const Separator = styled.div`
  flex: 1;
`

const QueryPickerButton = styled(SecondaryButton)<{
  firstTimeVisitor: boolean
}>`
  position: relative;
  margin: 0 1rem;
  flex: 0 0 auto;

  ${({ firstTimeVisitor }) =>
    firstTimeVisitor &&
    `&:after {
    border-radius: 50%;
    content: "";
    background: #dc4949;
    width: 8px;
    height: 8px;
    position: absolute;
    top: -3px;
    right: -3px;
  }`}
`

const MenuIcon = styled(_MenuIcon)`
  color: ${color("foreground")};
`

const CloseIcon = styled(_CloseIcon)`
  color: ${color("foreground")};
`

const SideMenuMenuButton = styled(TransparentButton)`
  padding: 0;

  .fade-enter {
    opacity: 0;
  }

  .fade-enter-active {
    opacity: 1;
    transition: opacity ${TransitionDuration.REG}ms;
  }

  .fade-exit {
    opacity: 0;
  }

  .fade-exit-active {
    opacity: 1;
    transition: opacity ${TransitionDuration.REG}ms;
  }
`

const MenuItems = styled.div`
  display: grid;
  grid-auto-flow: column;
  align-items: center;
`

const DropdownMenuItem = styled(DropdownMenu.Item)`
  color: ${({ theme }) => theme.color.foreground};
`

const MenuLink: React.FunctionComponent<{
  href: string
  text: string
}> = ({ href, text }) => (
  <Link
    color="foreground"
    hoverColor="foreground"
    href={href}
    rel="noreferrer"
    target="_blank"
  >
    {text}
  </Link>
)

const Menu = () => {
  const dispatch = useDispatch()
  const { quest } = useContext(QuestContext)
  const [queriesPopperActive, setQueriesPopperActive] = useState<boolean>()
  const [shortcutsPopperActive, setShortcutsPopperActive] = useState<boolean>()
  const escPress = useKeyPress("Escape")
  const { savedQueries } = useSelector(selectors.console.getConfig)
  const running = useSelector(selectors.query.getRunning)
  const opened = useSelector(selectors.console.getSideMenuOpened)
  const telemetryConfig = useSelector(selectors.telemetry.getConfig)
  const { sm } = useScreenSize()
  const { exampleQueriesVisited, updateSettings } = useLocalStorage()

  const handleClick = useCallback(() => {
    dispatch(actions.query.toggleRunning())
  }, [dispatch])
  const handleQueriesToggle = useCallback((active) => {
    if (!exampleQueriesVisited && active) {
      updateSettings(StoreKey.EXAMPLE_QUERIES_VISITED, true)
    }
    setQueriesPopperActive(active)
  }, [])
  const handleShortcutsToggle = useCallback((active) => {
    setShortcutsPopperActive(active)
  }, [])
  const handleHidePicker = useCallback(() => {
    setQueriesPopperActive(false)
  }, [])
  const handleSideMenuButtonClick = useCallback(() => {
    dispatch(actions.console.toggleSideMenu())
  }, [dispatch])

  useEffect(() => {
    setQueriesPopperActive(false)
  }, [escPress])

  useEffect(() => {
    if (!sm && opened) {
      dispatch(actions.console.toggleSideMenu())
    }
  }, [dispatch, opened, sm])

  return (
    <Wrapper _display={sm ? "none" : "inline"}>
      {running.value && (
        <ErrorButton onClick={handleClick}>
          <Stop size="18px" />
          <span>Cancel</span>
        </ErrorButton>
      )}

      <Separator />

      {savedQueries.length > 0 && (
        <PopperToggle
          active={queriesPopperActive}
          onToggle={handleQueriesToggle}
          trigger={
            <QueryPickerButton firstTimeVisitor={!exampleQueriesVisited}>
              <Add size="18px" />
              <span>Example queries</span>
            </QueryPickerButton>
          }
        >
          <QueryPicker hidePicker={handleHidePicker} queries={savedQueries} />
        </PopperToggle>
      )}

      <Separator />

      {!running.value && (
        <SuccessButton onClick={handleClick} title="Ctrl+Enter">
          <Play size="18px" />
          <span>Run</span>
        </SuccessButton>
      )}

      <MenuItems>
        <DocSearch
          appId="QL9L2YL7AQ"
          apiKey="2f67aeacbe73ad08a49efb9214ea27f3"
          indexName="questdb"
          placeholder="Search docs"
          translations={{ button: { buttonText: "Search docs" } }}
          hitComponent={({ hit, children }) => (
            <a href={hit.url} target="_blank" rel="noreferrer">
              {children}
            </a>
          )}
          navigator={{
            navigate({ itemUrl }) {
              return window.open(itemUrl, "_blank")
            },
          }}
        />
      </MenuItems>

      {sm && (
        <SideMenuMenuButton onClick={handleSideMenuButtonClick}>
          <CSSTransition
            classNames="fade"
            in={opened}
            timeout={TransitionDuration.REG}
          >
            {opened ? <CloseIcon size="26px" /> : <MenuIcon size="26px" />}
          </CSSTransition>
        </SideMenuMenuButton>
      )}
    </Wrapper>
  )
}

export default Menu
