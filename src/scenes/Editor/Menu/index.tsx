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
import { useCallback, useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"
import { CSSTransition } from "react-transition-group"
import styled, { css } from "styled-components"
import { CalendarCheckIcon } from "@phosphor-icons/react"
import { Close as _CloseIcon } from "../../../components/icons"
import { Menu as _MenuIcon } from "../../../components/icons"

import {
  Button,
  type ButtonProps,
  PaneMenu,
  TransitionDuration,
  SetupAIAssistant,
} from "../../../components"
import { ScreenSize, useScreenSize } from "../../../hooks"
import { actions, selectors } from "../../../store"
import { color } from "../../../utils"
import { DocSearch } from "@docsearch/react"
import { useSettings } from "../../../providers"
import { ThemeModeSelector } from "./ThemeModeSelector"
import {
  SIDEBAR_BUTTON_SIZE,
  SIDEBAR_ICON_SIZE,
  SIDEBAR_WIDTH,
} from "../../../consts"

const Wrapper = styled(PaneMenu)<{
  _display: string
  $isSmallScreen: boolean
}>`
  background: transparent;
  z-index: 15;
  padding-right: 1rem;
  flex-shrink: 0;

  ${({ $isSmallScreen }) =>
    $isSmallScreen &&
    css`
      width: ${SIDEBAR_WIDTH};
      min-width: ${SIDEBAR_WIDTH};
      height: 100%;
      padding: 0;
      border-left: 1px solid transparent;
      justify-content: center;
    `}

  .algolia-autocomplete {
    display: ${({ _display }) => _display} !important;
    flex: 0 1 168px;
  }
`

const Separator = styled.div`
  flex: 1;
`

const MenuIcon = styled(_MenuIcon)`
  color: ${color("contentPrimary")};
`

const CloseIcon = styled(_CloseIcon)`
  color: ${color("contentPrimary")};
`

const SideMenuMenuButton = styled(Button)`
  width: ${SIDEBAR_BUTTON_SIZE};
  min-width: ${SIDEBAR_BUTTON_SIZE};
  height: ${SIDEBAR_BUTTON_SIZE};
  min-height: ${SIDEBAR_BUTTON_SIZE};
  padding: 0.7rem;

  svg {
    width: ${SIDEBAR_ICON_SIZE}px;
    height: ${SIDEBAR_ICON_SIZE}px;
    flex: 0 0 ${SIDEBAR_ICON_SIZE}px;
  }

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

const LinkButton = (props: ButtonProps) => <Button {...props} as="a" />

const BookDemoButton = styled(LinkButton).attrs({
  variant: "primary",
  size: "md",
})`
  flex: 0 0 auto;
  text-decoration: none;
  font-weight: 600;
`

const MenuItems = styled.div<{ $hidden: boolean }>`
  display: ${({ $hidden }) => ($hidden ? "none" : "grid")};
  grid-auto-flow: column;
  align-items: center;
  gap: 1.2rem;
`

const Menu = () => {
  const dispatch = useDispatch()
  const { consoleConfig } = useSettings()
  const opened = useSelector(selectors.console.getSideMenuOpened)
  const isSmallScreen = useScreenSize() === ScreenSize.SM
  const handleSideMenuButtonClick = useCallback(() => {
    dispatch(actions.console.toggleSideMenu())
  }, [dispatch])

  useEffect(() => {
    if (!isSmallScreen && opened) {
      dispatch(actions.console.toggleSideMenu())
    }
  }, [dispatch, opened, isSmallScreen])

  return (
    <Wrapper
      _display={isSmallScreen ? "none" : "inline"}
      $isSmallScreen={isSmallScreen}
    >
      {!isSmallScreen && <Separator />}

      <MenuItems $hidden={isSmallScreen}>
        <ThemeModeSelector />
        <SetupAIAssistant />
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
        {consoleConfig.ctaBanner && (
          <BookDemoButton
            href="https://questdb.com/enterprise/contact"
            target="_blank"
            rel="noreferrer"
            prefixIcon={<CalendarCheckIcon size={17} weight="bold" />}
          >
            Book a demo
          </BookDemoButton>
        )}
      </MenuItems>

      {isSmallScreen && (
        <SideMenuMenuButton
          variant="ghost"
          aria-controls="mobile-data-sources-panel"
          aria-expanded={opened}
          aria-label={opened ? "Close data sources" : "Open data sources"}
          onClick={handleSideMenuButtonClick}
        >
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
