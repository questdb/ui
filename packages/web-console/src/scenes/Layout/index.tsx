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

import React, { useEffect, useState, useCallback, useContext } from "react"
import styled from "styled-components"
import { BusEvent } from "../../consts"
import Footer from "../Footer"
import Console from "../Console"
import Import from "../Import"
import SideMenu from "../SideMenu"
import { Sidebar } from "../../components/Sidebar"
import { TopBar } from "../../components/TopBar"
import { QuestProvider, QuestContext } from "../../providers"
import { useSelector } from "react-redux"
import { selectors } from "../../store"
import News from "../../scenes/News"
import { CreateTableDialog } from "../../components/CreateTableDialog"
import { Chat3, Command, Question } from "@styled-icons/remix-line"
import { Slack } from "@styled-icons/boxicons-logos"
import {
  PrimaryToggleButton,
  Text,
  toast,
  PopperToggle,
  Link,
} from "../../components"
import { DropdownMenu, FeedbackDialog } from "@questdb/react-components"
import { color } from "../../utils"
import { BUTTON_ICON_SIZE } from "../../consts/index"
import { Shortcuts } from "../Editor/Shortcuts"
import { EditorProvider } from "../../providers/EditorProvider"

const Page = styled.div`
  display: flex;
  width: 100%;
  height: calc(100% - 4rem);
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  font-size: 1.4rem;
  background: #21222c;

  ::selection {
    background: #44475a;
  }
`

const Root = styled.div`
  display: flex;
  width: 100%;
  height: 100%;
`

const Main = styled.div<{ sideOpened: boolean }>`
  flex: 1;
  width: ${({ sideOpened }) =>
    sideOpened ? "calc(100% - 50rem - 4.5rem)" : "calc(100% - 4.5rem)"};
`

const Drawer = styled.div`
  background: ${({ theme }) => theme.color.backgroundDarker};
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

const Layout = () => {
  const { quest } = useContext(QuestContext)
  const telemetryConfig = useSelector(selectors.telemetry.getConfig)
  const activePanel = useSelector(selectors.console.getActivePanel)
  const [shortcutsPopperActive, setShortcutsPopperActive] = useState()
  const handleShortcutsToggle = useCallback((active) => {
    setShortcutsPopperActive(active)
  }, [])

  const isSideOpened = () => {
    return ["create", "news"].includes(activePanel)
  }

  useEffect(() => {
    window.bus.trigger(BusEvent.REACT_READY)
  }, [])

  return (
    <QuestProvider>
      <EditorProvider>
        <TopBar />
        <Root>
          <Main sideOpened={isSideOpened()}>
            <Page
              style={{
                display:
                  activePanel === "console" || isSideOpened() ? "flex" : "none",
              }}
            >
              <Console />
            </Page>

            <Page
              style={{ display: activePanel === "import" ? "flex" : "none" }}
            >
              <Import />
            </Page>
          </Main>

          <Drawer id="side-panel-right" />

          <Sidebar align="top">
            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <PrimaryToggleButton>
                  <Question size={BUTTON_ICON_SIZE} />
                </PrimaryToggleButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content>
                <DropdownMenuItem onSelect={(e: Event) => e.preventDefault()}>
                  <Chat3 size="18px" />
                  <FeedbackDialog
                    withEmailInput
                    title="Contact us"
                    subtitle="Let us know your thoughts"
                    trigger={({ setOpen }) => (
                      <Text color="foreground" onClick={() => setOpen(true)}>
                        Contact us
                      </Text>
                    )}
                    onSubmit={async ({
                      email,
                      message,
                    }: {
                      email: string
                      message: string
                    }) => {
                      try {
                        await quest.sendFeedback({
                          email,
                          message,
                          telemetryConfig,
                        })
                        toast.success(
                          "Thank you for your feedback! Our team will review it shortly.",
                        )
                      } catch (err) {
                        toast.error(
                          "Something went wrong. Please try again later.",
                        )
                        throw err
                      }
                    }}
                  />
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Slack size="18px" />
                  <MenuLink
                    href="https://slack.questdb.io/"
                    text="Slack community"
                  />
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Question size="18px" />
                  <MenuLink
                    href="https://questdb.io/docs/develop/web-console/"
                    text="Web Console Docs"
                  />
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleShortcutsToggle(true)}>
                  <Command size="18px" />
                  <Text color="foreground">Shortcuts</Text>
                </DropdownMenuItem>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            <News />
            <CreateTableDialog />
            <PopperToggle
              active={shortcutsPopperActive}
              onToggle={handleShortcutsToggle}
              trigger={<div style={{ height: "4rem" }} />}
            >
              <Shortcuts />
            </PopperToggle>
          </Sidebar>
        </Root>

        <SideMenu />

        <Footer />
      </EditorProvider>
    </QuestProvider>
  )
}

export default Layout
