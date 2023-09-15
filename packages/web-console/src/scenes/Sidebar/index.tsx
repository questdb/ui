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
import { useDispatch, useSelector } from "react-redux"
import styled from "styled-components"
import { CodeSSlash, Notification2 } from "styled-icons/remix-line"
import { Upload2 } from "styled-icons/remix-line"
import { Settings2 } from "styled-icons/evaicons-solid"

import { PopperHover, PrimaryToggleButton, Tooltip } from "../../components"
import { actions, selectors } from "../../store"
import { color } from "../../utils"

const Wrapper = styled.div`
  display: flex;
  height: calc(100% - 4rem);
  flex: 0 0 4.5rem;
  flex-direction: column;

  background: ${color("backgroundDarker")};
`

const Logo = styled.div`
  position: relative;
  display: flex;
  flex: 0 0 4rem;
  background: ${color("black")};
  z-index: 1;
  align-items: center;
  justify-content: center;
  cursor: pointer;
`

type NavigationProps = Readonly<{
  selected: boolean
}>

const Navigation = styled(PrimaryToggleButton)<NavigationProps>`
  display: flex;
  flex-direction: column;
  flex: 0 0 5rem;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  & > span {
    margin-left: 0 !important;
  }

  & > :not(:first-child) {
    margin-top: 0.3rem;
  }
`

const DisabledNavigation = styled.div`
  display: flex;
  position: relative;
  height: 100%;
  width: 100%;
  flex: 0 0 5rem;
  align-items: center;
  justify-content: center;

  &:disabled {
    pointer-events: none;
    cursor: default;
  }
`

const Sidebar = () => {
  const dispatch = useDispatch()
  const { readOnly } = useSelector(selectors.console.getConfig)
  const activePanel = useSelector(selectors.console.getActivePanel)

  return (
    <Wrapper>
      <Logo onClick={() => dispatch(actions.console.setActivePanel("console"))}>
        <img alt="QuestDB Logo" height="26" src="/assets/favicon.svg" />
      </Logo>

      <PopperHover
        delay={350}
        placement="right"
        trigger={
          <Navigation
            direction="left"
            onClick={() => dispatch(actions.console.setActivePanel("console"))}
            selected={activePanel === "console"}
            data-hook="navigation-console-button"
          >
            <CodeSSlash size="18px" />
          </Navigation>
        }
      >
        <Tooltip>Console</Tooltip>
      </PopperHover>

      <PopperHover
        delay={readOnly ? 0 : 350}
        placement="right"
        trigger={
          readOnly ? (
            <DisabledNavigation>
              <Navigation
                direction="left"
                disabled
                onClick={() =>
                  dispatch(actions.console.setActivePanel("import"))
                }
                selected={activePanel === "import"}
              >
                <Upload2 size="18px" />
              </Navigation>
            </DisabledNavigation>
          ) : (
            <Navigation
              direction="left"
              onClick={() => dispatch(actions.console.setActivePanel("import"))}
              selected={activePanel === "import"}
              data-hook="navigation-import-button"
            >
              <Upload2 size="18px" />
            </Navigation>
          )
        }
      >
        <Tooltip>
          {readOnly ? (
            <>
              <b>Import</b> is currently disabled.
              <br />
              To use this feature, turn <b>read-only</b> mode to <i>false</i> in
              the configuration file
            </>
          ) : (
            <>Import</>
          )}
        </Tooltip>
      </PopperHover>

      <PopperHover
        delay={readOnly ? 0 : 350}
        placement="right"
        trigger={
          readOnly ? (
            <DisabledNavigation>
              <Navigation
                direction="left"
                disabled
                onClick={() =>
                  dispatch(actions.console.setActivePanel("settings"))
                }
                selected={activePanel === "settings"}
              >
                <Settings2 size="18px" />
              </Navigation>
            </DisabledNavigation>
          ) : (
            <Navigation
              direction="left"
              onClick={() =>
                dispatch(actions.console.setActivePanel("settings"))
              }
              selected={activePanel === "settings"}
              data-hook="navigation-settings-button"
            >
              <Settings2 size="18px" />
            </Navigation>
          )
        }
      >
        <Tooltip>
          {readOnly ? (
            <>
              <b>Settings</b> is currently disabled.
              <br />
              To use this feature, turn <b>read-only</b> mode to <i>false</i> in
              the configuration file
            </>
          ) : (
            <>Settings</>
          )}
        </Tooltip>
      </PopperHover>

      <PopperHover
        delay={350}
        placement="right"
        trigger={
          <Navigation
            direction="left"
            onClick={() => dispatch(actions.console.setActivePanel("news"))}
            selected={activePanel === "news"}
            data-hook="navigation-news-button"
          >
            <Notification2 size="18px" />
          </Navigation>
        }
      >
        <Tooltip>News</Tooltip>
      </PopperHover>
    </Wrapper>
  )
}

export default Sidebar
