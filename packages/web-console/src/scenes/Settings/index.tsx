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

import React, { useCallback, useState } from "react"
import styled from "styled-components"
import Notifications from "./Notifications"
import { PaneContent, Text, PrimaryToggleButton, Page } from "../../components"
import { Settings2 } from "@styled-icons/evaicons-solid"
import { Popup } from "@styled-icons/entypo"
import { color } from "../../utils"

const Root = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 2rem;
`

const PaneWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 0;
`

const PageInfo = styled(Text)`
  margin-bottom: 2rem;
`

const Icon = styled(Settings2)`
  color: ${color("foreground")};
`
const SettingsMenu = styled(PaneWrapper)`
  width: 100%;
  padding: 0 10px;
`

const ToggleButton = styled(PrimaryToggleButton)`
  height: 4rem;
  padding: 0 1rem;
`
const Content = styled(PaneContent)`
  color: ${color("foreground")};

  *::selection {
    background: ${color("red")};
    color: ${color("foreground")};
  }
`

const Settings = () => {
  const [selected, setSelected] = useState<"notification">("notification")
  const handleNotificationClick = useCallback(() => {
    setSelected("notification")
  }, [])

  return (
    <Page title="Settings" icon={<Icon size="20px" />}>
      <Root>
        <PageInfo color="foreground">
          On this page, you can customize your Quest DB console
        </PageInfo>
        <PaneWrapper>
          <SettingsMenu>
            <ToggleButton
              onClick={handleNotificationClick}
              selected={selected === "notification"}
            >
              <Popup size="18px" />
              <span>Notification Log</span>
            </ToggleButton>
          </SettingsMenu>
        </PaneWrapper>
        <Content>{selected === "notification" && <Notifications />}</Content>
      </Root>
    </Page>
  )
}

export default Settings
