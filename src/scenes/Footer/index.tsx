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

import React, { useCallback, useEffect, useState } from "react"
import { CSSTransition } from "react-transition-group"
import styled, { createGlobalStyle } from "styled-components"
import { Github } from "@styled-icons/remix-fill"

import { Link, Text, TransitionDuration } from "../../components"

import CtaBanner from "./CtaBanner"
import BuildVersion from "./BuildVersion"
import ConnectionStatus from "./ConnectionStatus"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { useSettings } from "../../providers"

const Wrapper = styled.div`
  position: absolute;
  display: flex;
  height: 4rem;
  bottom: 0;
  left: 0;
  right: 0;
  padding-left: 45px;
`

const LeftContainer = styled.div`
  display: flex;
  padding-left: 1rem;
  align-items: center;
  flex: 1;
`

const RightContainer = styled.div`
  display: flex;
  padding-right: 1rem;
  align-items: center;

  & > *:not(:last-child) {
    margin-right: 1rem;
  }
`

const CtaBannerTransition = createGlobalStyle`
  .cta-banner-enter {
    bottom: -10rem;
    opacity: 0;
  }

  .cta-banner-enter-active {
    bottom: 1.6rem;
    opacity: 1;
    transition: bottom ${TransitionDuration.REG}ms ease-out, opacity ${TransitionDuration.REG}ms ease-out;
  }

  .cta-banner-exit,
  .cta-banner-enter-done {
    bottom: 1.6rem;
    opacity: 1;
  }

  .cta-banner-exit-active {
    bottom: -10rem;
    opacity: 0;
    transition: bottom ${TransitionDuration.REG}ms ease-in, opacity ${TransitionDuration.REG}ms ease-in;
  }
`

const Footer = () => {
  const [showBanner, setShowBanner] = useState(false)
  const [showBuildVersion, setShowBuildVersion] = useState(true)
  const handleClick = useCallback(() => {
    setShowBanner(false)
  }, [])
  const { consoleConfig } = useSettings()

  useEffect(() => {
    setTimeout(() => {
      setShowBanner(true)
    }, 2e3)

    eventBus.subscribe(EventType.MSG_CONNECTION_ERROR, () => {
      setShowBuildVersion(false)
    })

    eventBus.subscribe(EventType.MSG_CONNECTION_OK, () => {
      setShowBuildVersion(true)
    })
  }, [])

  return (
    <Wrapper id="footer">
      <LeftContainer>
        <Text color="foreground">
          Copyright &copy; {new Date().getFullYear()} QuestDB
        </Text>
      </LeftContainer>
      <RightContainer>
        <ConnectionStatus />
        {showBuildVersion && <BuildVersion />}
        <Link
          color="foreground"
          hoverColor="cyan"
          href="https://github.com/questdb/questdb"
          rel="noreferrer"
          target="_blank"
        >
          <Github size="18px" />
        </Link>
      </RightContainer>

      <CtaBannerTransition />
      <CSSTransition
        classNames="cta-banner"
        in={showBanner && consoleConfig.ctaBanner}
        timeout={TransitionDuration.REG}
        unmountOnExit
      >
        <CtaBanner onClick={handleClick} />
      </CSSTransition>
    </Wrapper>
  )
}

export default Footer
