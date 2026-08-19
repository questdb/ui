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
import { Github } from "../../components/icons"

import { Button, type ButtonProps, TransitionDuration } from "../../components"

import CtaBanner from "./CtaBanner"
import BuildVersion from "./BuildVersion"
import ConnectionStatus from "./ConnectionStatus"
import MCPBridgeStatus from "./MCPBridgeStatus"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { useSettings } from "../../providers"
import { FOOTER_HEIGHT } from "../../consts"

const Wrapper = styled.div`
  position: relative;
  display: flex;
  flex: 0 0 ${FOOTER_HEIGHT};
  height: ${FOOTER_HEIGHT};
  padding: 0 0.8rem 0 6.4rem;
  background-color: ${({ theme }) => theme.color.surfaceBase};
  background-image: none;
  border-top: 1px solid ${({ theme }) => theme.color.borderSubtle};
  box-shadow: none;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-family: ${({ theme }) => theme.font};
  font-size: 1.3rem;
  z-index: 20;
`

const LeftContainer = styled.div`
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
`

const RightContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;

  & > * {
    flex-shrink: 0;
  }
`

const GithubLinkButton = (props: ButtonProps) => (
  <Button {...props} as="a" variant="tertiary" />
)

const GithubLink = styled(GithubLinkButton)`
  width: 3.2rem;
  height: 3.2rem;
  padding: 0;
  border-radius: 0.6rem;
`

const CtaBannerTransition = createGlobalStyle`
  .cta-banner-enter {
    opacity: 0;
    transform: translate(-50%, calc(100% + 2rem));
  }

  .cta-banner-enter-active {
    opacity: 1;
    transform: translate(-50%, 0);
    transition:
      transform ${TransitionDuration.REG}ms cubic-bezier(0.2, 0.8, 0.2, 1),
      opacity ${TransitionDuration.REG}ms ease-out;
  }

  .cta-banner-exit,
  .cta-banner-enter-done {
    opacity: 1;
    transform: translate(-50%, 0);
  }

  .cta-banner-exit-active {
    opacity: 0;
    transform: translate(-50%, calc(100% + 2rem));
    transition:
      transform ${TransitionDuration.REG}ms ease-in,
      opacity ${TransitionDuration.REG}ms ease-in;
  }

  @media (prefers-reduced-motion: reduce) {
    .cta-banner-enter-active,
    .cta-banner-exit-active {
      transition-duration: 0ms;
    }
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
        <ConnectionStatus />
      </LeftContainer>
      <RightContainer>
        <MCPBridgeStatus />
        {showBuildVersion && <BuildVersion />}
        <GithubLink
          href="https://github.com/questdb/questdb"
          rel="noreferrer"
          target="_blank"
          aria-label="QuestDB on GitHub"
        >
          <Github size="19px" weight="regular" />
        </GithubLink>
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
