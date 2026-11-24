import React, { useCallback, useEffect, useRef, useState } from "react"
import ReactDOM from "react-dom"
import { CSSTransition } from "react-transition-group"
import styled from "styled-components"
import { Close } from "../icons"
import { CheckIcon, KeyIcon } from "@phosphor-icons/react"
import { Button } from "../Button"
import { TextButton } from "../TextButton"
import { IconButton } from "../IconButton"
import { Text } from "../Text"
import { Box } from "../Box"
import { AISparkle } from "../AISparkle"
import { TransitionDuration } from "../Transition"
import { usePopper } from "../../hooks"
import { floatingSurfaceStyles } from "../overlayStyles"

const TooltipContainer = styled.div<{ $positionReady: boolean }>`
  position: relative;
  z-index: 1000;

  visibility: ${({ $positionReady }) =>
    $positionReady ? "visible" : "hidden"};
`

const Arrow = styled.div<{ $styles?: React.CSSProperties }>`
  position: absolute;
  width: 1.6rem;
  height: 0.6rem;
  top: -0.6rem;
  left: 50%;
  transform: translateX(-50%) rotate(180deg);
  pointer-events: none;

  &::before {
    content: "";
    position: absolute;
    width: 1.6rem;
    height: 0.6rem;
    background: linear-gradient(
      to bottom,
      ${({ theme }) => theme.color.transparent} 0%,
      ${({ theme }) => theme.color.borderDefault} 100%
    );
    clip-path: polygon(50% 100%, 0% 0%, 100% 0%);
    transform: rotate(180deg);
  }

  &::after {
    content: "";
    position: absolute;
    width: 0;
    height: 0;
    top: 0.1rem;
    left: 50%;
    transform: translateX(-50%);
    border-left: 0.7rem solid transparent;
    border-right: 0.7rem solid transparent;
    border-bottom: 0.5rem solid ${({ theme }) => theme.color.surfaceOverlay};
  }
`

const Content = styled.div`
  ${floatingSurfaceStyles}
  width: 38.3rem;
  padding: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`

const Header = styled(Box).attrs({
  align: "center",
  justifyContent: "space-between",
})`
  width: 100%;
`

const AssistantTitle = styled(Box).attrs({
  align: "center",
  gap: "1rem",
})`
  flex: 1;
`

const TitleText = styled(Text)`
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.6rem;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.contentPrimary};
  line-height: 2.25rem;
`

const CloseButton = styled(IconButton).attrs({
  label: "Close",
  variant: "ghost",
  size: "sm",
})`
  padding: 0.4rem;
`

const Headline = styled(Text)`
  font-weight: 600;
  font-size: 1.6rem;
  line-height: 2.2rem;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const Description = styled(Text)`
  font-size: 1.3rem;
  line-height: 1.857rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  padding-right: 0.8rem;
`

const Perks = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
`

const Perk = styled.li`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.contentPrimary};

  svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.statusSuccess};
  }
`

const Footer = styled(Box).attrs({
  flexDirection: "column",
  align: "stretch",
  gap: "1rem",
})`
  padding-top: 0.6rem;
  width: 100%;
`

const ApiKeyButton = styled(TextButton)`
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
`

type Props = {
  triggerRef: React.RefObject<HTMLElement | null>
  onConnectAgentClick: () => void
  onSetupClick: () => void
  showPromo: boolean
  setShowPromo: (show: boolean) => void
}

export const AIAssistantPromo = ({
  triggerRef,
  onConnectAgentClick,
  onSetupClick,
  showPromo,
  setShowPromo,
}: Props) => {
  const [container] = useState<HTMLElement>(document.createElement("div"))
  const transitionTimeoutId = useRef<number | undefined>(undefined)
  const [arrowElement, setArrowElement] = useState<HTMLElement | null>(null)
  const [popperElement, setPopperElement] = useState<HTMLElement | null>(null)
  const transitionNodeRef = useRef<HTMLElement | null>(null)
  const attachPopperElement = useCallback((element: HTMLElement | null) => {
    transitionNodeRef.current = element
    setPopperElement(element)
  }, [])
  const [positionReady, setPositionReady] = useState(false)
  const promoKeyRef = useRef(0)

  const { attributes, styles, forceUpdate } = usePopper(
    triggerRef.current || undefined,
    popperElement || undefined,
    {
      modifiers: [
        {
          name: "arrow",
          options: { element: arrowElement || undefined },
        },
        {
          name: "offset",
          options: { offset: [0, 10] },
        },
        {
          name: "eventListeners",
          enabled: showPromo,
        },
      ],
      placement: "bottom-end",
    },
  )

  const handleClose = useCallback(() => {
    setShowPromo(false)
  }, [])

  const handleSetupClick = useCallback(() => {
    setShowPromo(false)
    onSetupClick()
  }, [onSetupClick])

  const handleConnectAgentClick = useCallback(() => {
    setShowPromo(false)
    onConnectAgentClick()
  }, [onConnectAgentClick])

  useEffect(() => {
    document.body.appendChild(container)

    return () => {
      clearTimeout(transitionTimeoutId.current)
      if (document.body.contains(container)) {
        document.body.removeChild(container)
      }
    }
  }, [container])

  useEffect(() => {
    if (showPromo) {
      promoKeyRef.current += 1
      setPositionReady(false)
    } else {
      setPositionReady(false)
      setPopperElement(null)
      setArrowElement(null)
    }
  }, [showPromo])

  useEffect(() => {
    if (popperElement && styles.popper && showPromo && !positionReady) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setPositionReady(true)
        })
      })
    }
  }, [popperElement, styles.popper, positionReady, showPromo])

  useEffect(() => {
    if (showPromo && forceUpdate && triggerRef.current && popperElement) {
      requestAnimationFrame(() => {
        forceUpdate()
      })
    }
  }, [showPromo, forceUpdate, triggerRef, popperElement])

  useEffect(() => {
    if (!showPromo) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const isClickInsidePopper =
        popperElement && popperElement.contains(target)
      const isClickOnTrigger =
        triggerRef.current && triggerRef.current.contains(target)

      if (!isClickInsidePopper && !isClickOnTrigger) {
        setShowPromo(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside, true)

    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true)
    }
  }, [showPromo, popperElement, triggerRef])

  if (!triggerRef.current && !showPromo) {
    return null
  }

  if (!showPromo) {
    return null
  }

  return (
    <>
      {ReactDOM.createPortal(
        <CSSTransition
          nodeRef={transitionNodeRef}
          key={promoKeyRef.current}
          classNames="fade-reg"
          in={positionReady}
          timeout={TransitionDuration.REG}
          unmountOnExit={false}
        >
          <TooltipContainer
            ref={attachPopperElement}
            {...attributes.popper}
            style={{
              zIndex: 1000,
              ...styles.popper,
            }}
            $positionReady={positionReady}
          >
            <Arrow
              ref={setArrowElement}
              style={styles.arrow}
              data-popper-arrow
            />
            <Content data-hook="ai-promo-modal">
              <Header>
                <AssistantTitle>
                  <AISparkle size={28} variant="filled" />
                  <TitleText>Meet QuestDB Assistant</TitleText>
                </AssistantTitle>
                <CloseButton
                  onClick={handleClose}
                  aria-label="Close"
                  data-hook="ai-promo-close"
                >
                  <Close size="2rem" />
                </CloseButton>
              </Header>

              <Headline>Chat with your coding agent here</Headline>
              <Description>
                Use Claude Code, Codex, Gemini, Copilot or Cursor in the
                console. It works on your tables and notebooks.
              </Description>
              <Perks>
                <Perk>
                  <CheckIcon size={14} weight="bold" />
                  Uses the subscription you already have
                </Perk>
                <Perk>
                  <CheckIcon size={14} weight="bold" />
                  No API key, no config files
                </Perk>
                <Perk>
                  <CheckIcon size={14} weight="bold" />
                  Set up in about a minute
                </Perk>
              </Perks>

              <Footer>
                <Button
                  variant="primary"
                  onClick={handleConnectAgentClick}
                  data-hook="ai-promo-connect-agent"
                >
                  Connect your coding agent
                </Button>
                <ApiKeyButton
                  type="button"
                  onClick={handleSetupClick}
                  data-hook="ai-promo-continue"
                >
                  <KeyIcon size={14} />
                  Use an API key instead
                </ApiKeyButton>
              </Footer>
            </Content>
          </TooltipContainer>
        </CSSTransition>,
        container,
      )}
    </>
  )
}
