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

import React, { useCallback, useEffect } from "react"
import styled from "styled-components"
import Footer from "../Footer"
import Console from "../Console"
import SideMenu from "../SideMenu"
import { Sidebar } from "../../components/Sidebar"
import { TopBar } from "../../components/TopBar"
import News from "../../scenes/News"
import {
  EditorProvider,
  SearchProvider,
  AIConversationProvider,
} from "../../providers"
import { Help } from "./help"
import { Warnings } from "./warning"
import { AIChatButton } from "./AIChatButton"
import { TableDetailsButton } from "./TableDetailsButton"
import { TableDetailsDrawer } from "../Schema/TableDetailsDrawer"
import { AIChatWindowLazy } from "../Editor/AIChatWindow/AIChatWindowLazy"

import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { AIStatusProvider } from "../../providers/AIStatusProvider"
import { MCPBridgeProvider } from "../../providers/MCPBridgeProvider"
import { NotebookOnboardingModal } from "../../components/NotebookOnboardingModal"

const Page = styled.div`
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  font-size: 1.4rem;
  background-color: ${({ theme }) => theme.color.surfaceCanvas};
  background-image:
    linear-gradient(
      ${({ theme }) => theme.color.borderSubtle} 1px,
      transparent 1px
    ),
    linear-gradient(
      90deg,
      ${({ theme }) => theme.color.borderSubtle} 1px,
      transparent 1px
    );
  background-size: 32px 32px;

  ::selection {
    background: ${({ theme }) => theme.color.editorSelection};
  }
`

const Root = styled.div`
  display: flex;
  width: 100%;
  flex: 1;
  overflow: hidden;
  background: ${({ theme }) => theme.color.surfaceCanvas};
`

const Main = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  width: calc(100% - 5.6rem);
`

const Layout = () => {
  const focusListener = useCallback(() => {
    eventBus.publish(EventType.TAB_FOCUS)
  }, [])

  const blurListener = useCallback(() => {
    eventBus.publish(EventType.TAB_BLUR)
  }, [])

  useEffect(() => {
    window.addEventListener("focus", focusListener)
    window.addEventListener("blur", blurListener)

    return () => {
      window.removeEventListener("focus", focusListener)
      window.removeEventListener("blur", blurListener)
    }
  }, [])

  return (
    <SearchProvider>
      <EditorProvider>
        <AIConversationProvider>
          <AIStatusProvider>
            <MCPBridgeProvider>
              <TopBar />
              <Warnings />
              <Root>
                <Main>
                  <Page>
                    <Console />
                  </Page>
                </Main>

                <Sidebar align="top">
                  <AIChatButton />
                  <TableDetailsButton />
                  <News />
                  <Help />
                </Sidebar>
                <TableDetailsDrawer />
                <AIChatWindowLazy />
              </Root>

              <SideMenu />

              <Footer />
              <NotebookOnboardingModal />
            </MCPBridgeProvider>
          </AIStatusProvider>
        </AIConversationProvider>
      </EditorProvider>
    </SearchProvider>
  )
}

export default Layout
