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
import docsearch from "docsearch.js"
import { useCallback, useEffect, useState, useContext } from "react"
import { useDispatch, useSelector } from "react-redux"
import { CSSTransition } from "react-transition-group"
import styled from "styled-components"
import {
  Add,
  Chat3,
  Close as _CloseIcon,
  Command,
  Database2,
  Play,
  Stop,
} from "styled-icons/remix-line"
import { Menu as _MenuIcon } from "styled-icons/remix-fill"
import { HelpCircle } from "styled-icons/boxicons-regular"
import { Slack } from "styled-icons/boxicons-logos"

import {
  ErrorButton,
  Input,
  Link,
  PaneMenu,
  PopperHover,
  PopperToggle,
  SecondaryButton,
  SuccessButton,
  toast,
  Tooltip,
  TransitionDuration,
  TransparentButton,
  useKeyPress,
  useScreenSize,
} from "../../../components"
import { FeedbackDialog } from "@questdb/react-components"
import { actions, selectors } from "../../../store"
import { color } from "../../../utils"

import QueryPicker from "../QueryPicker"
import { Shortcuts } from "../Shortcuts"
import { useLocalStorage } from "../../../providers/LocalStorageProvider"
import { StoreKey } from "../../../utils/localStorage/types"
import { QuestContext } from "../../../providers"

const Wrapper = styled(PaneMenu)<{ _display: string }>`
  z-index: 15;

  .algolia-autocomplete {
    display: ${({ _display }) => _display} !important;
    flex: 0 1 168px;
  }
`

const Separator = styled.div`
  flex: 1;
`

const DocsearchInput = styled(Input)`
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

const ShowSchemaButton = styled(SecondaryButton)`
  margin-right: 1rem;
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

const MenuButton = styled(SecondaryButton)`
  margin-right: 1rem;
`

const MenuLink: React.FunctionComponent<{
  href: string
  icon: React.ReactNode
  tooltipText: string
}> = ({ href, icon, tooltipText }) => {
  const Trigger = (
    <MenuButton>
      <Link
        color="foreground"
        hoverColor="foreground"
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        {icon}
      </Link>
    </MenuButton>
  )

  return (
    <PopperHover delay={350} placement="bottom" trigger={Trigger}>
      <Tooltip>{tooltipText}</Tooltip>
    </PopperHover>
  )
}

const Menu = () => {
  const dispatch = useDispatch()
  const { quest } = useContext(QuestContext)
  const [queriesPopperActive, setQueriesPopperActive] = useState<boolean>()
  const [shortcutsPopperActive, setShortcutsPopperActive] = useState<boolean>()
  const [isFeedbackSubmitting, setIsFeedbackSubmitting] =
    useState<boolean>(false)
  const escPress = useKeyPress("Escape")
  const { savedQueries } = useSelector(selectors.console.getConfig)
  const running = useSelector(selectors.query.getRunning)
  const opened = useSelector(selectors.console.getSideMenuOpened)
  const telemetryConfig = useSelector(selectors.telemetry.getConfig)
  const { sm } = useScreenSize()
  const { resultsSplitterBasis, exampleQueriesVisited, updateSettings } =
    useLocalStorage()

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
  const handleShowSchemaClick = useCallback(() => {
    updateSettings(StoreKey.RESULTS_SPLITTER_BASIS, 300)
  }, [])

  useEffect(() => {
    setQueriesPopperActive(false)
  }, [escPress])

  useEffect(() => {
    docsearch({
      apiKey: "b2a69b4869a2a85284a82fb57519dcda",
      indexName: "questdb",
      inputSelector: "#docsearch-input",
      handleSelected: (input, event, suggestion, datasetNumber, context) => {
        if (context.selectionMethod === "click") {
          input.setVal("")
          const win = window.open(suggestion.url, "_blank")

          if (win) {
            win.focus()
          }
        }
      },
    })
  }, [])

  useEffect(() => {
    if (!sm && opened) {
      dispatch(actions.console.toggleSideMenu())
    }
  }, [dispatch, opened, sm])

  return (
    <Wrapper _display={sm ? "none" : "inline"}>
      {resultsSplitterBasis === 0 && (
        <PopperHover
          delay={350}
          placement="bottom"
          trigger={
            <ShowSchemaButton onClick={handleShowSchemaClick}>
              <Database2 size="18px" />
            </ShowSchemaButton>
          }
        >
          <Tooltip>Show tables</Tooltip>
        </PopperHover>
      )}

      {running.value && (
        <ErrorButton onClick={handleClick}>
          <Stop size="18px" />
          <span>Cancel</span>
        </ErrorButton>
      )}

      {!running.value && (
        <SuccessButton onClick={handleClick} title="Ctrl+Enter">
          <Play size="18px" />
          <span>Run</span>
        </SuccessButton>
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

      <FeedbackDialog
        isSubmitting={isFeedbackSubmitting}
        title="Web Console feedback"
        subtitle="Let us know your thoughts"
        trigger={({ setOpen }: { setOpen: (isOpen: boolean) => void }) => (
          <MenuButton onClick={() => setOpen(true)}>
            <Chat3 size="18px" />
            {!sm && <span>Feedback</span>}
          </MenuButton>
        )}
        onSubmit={async ({ message }: { message: string }) => {
          setIsFeedbackSubmitting(true)
          try {
            await quest.sendFeedback({
              message,
              telemetryConfig,
            })
            toast.success(
              "Thank you for your feedback! Our team will review it shortly.",
            )
          } catch (err) {
            toast.error("Something went wrong. Please try again later.")
            throw err
          } finally {
            setIsFeedbackSubmitting(false)
          }
        }}
      />

      <MenuLink
        href="https://slack.questdb.io/"
        icon={<Slack size="18px" />}
        tooltipText="Questions? Join our Slack"
      />

      <MenuLink
        href="https://questdb.io/docs/develop/web-console/"
        icon={<HelpCircle size="18px" />}
        tooltipText="Go to Web Console help"
      />

      <PopperToggle
        active={shortcutsPopperActive}
        onToggle={handleShortcutsToggle}
        trigger={
          <MenuButton>
            <Command size="18px" />
            {!sm && <span>Shortcuts</span>}
          </MenuButton>
        }
        placement="bottom"
      >
        <Shortcuts />
      </PopperToggle>

      <DocsearchInput
        id="docsearch-input"
        placeholder="Search documentation"
        title="Search..."
      />

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
