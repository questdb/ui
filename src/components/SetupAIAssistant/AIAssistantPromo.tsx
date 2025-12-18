import React, { useCallback, useEffect, useRef, useState } from "react"
import ReactDOM from "react-dom"
import { usePopper } from "react-popper"
import { CSSTransition } from "react-transition-group"
import styled from "styled-components"
import { Close } from "@styled-icons/remix-line"
import { Button } from "../Button"
import { Text } from "../Text"
import { Box } from "../Box"
import { AISparkle } from "../AISparkle"
import { TransitionDuration } from "../Transition"

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
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0.2) 100%
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
    border-bottom: 0.5rem solid ${({ theme }) => theme.color.backgroundDarker};
  }
`

const Content = styled.div`
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 0.1rem solid transparent;
  border-radius: 0.4rem;
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
  color: ${({ theme }) => theme.color.foreground};
  line-height: 2.25rem;
`

const CloseButton = styled.button`
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.gray2};
  width: 2.8rem;
  height: 2.8rem;
  flex-shrink: 0;

  &:hover {
    color: ${({ theme }) => theme.color.foreground};
  }
`

const Description = styled(Text)`
  font-size: 1.3rem;
  line-height: 1.857rem;
  color: ${({ theme }) => theme.color.foreground};
  padding-right: 0.8rem;
`

const AssistantModes = styled(Box).attrs({
  flexDirection: "column",
  gap: "1rem",
})`
  padding-top: 1.4rem;
`

const AssistantMode = styled(Box).attrs({
  gap: "1rem",
  align: "flex-start",
})`
  width: 100%;
`

const IconContainer = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  background: ${({ theme }) => theme.color.selectionDarker};
  border-radius: 0.4rem;
  padding: 0.8rem;
  width: 4.8rem;
  height: 4rem;
  flex-shrink: 0;
`

const ModeIcon = styled.img`
  width: 2.4rem;
  height: 2.4rem;
  color: ${({ theme }) => theme.color.pink};
`

const ModeContent = styled(Box).attrs({
  flexDirection: "column",
  gap: "0.5rem",
  align: "flex-start",
})`
  flex: 1;
`

const ModeTitleRow = styled(Box).attrs({
  align: "center",
  gap: "1rem",
})`
  width: 100%;
`

const ModeTitle = styled(Text)`
  font-weight: 600;
  font-size: 1.4rem;
  line-height: 1.8rem;
  text-align: left;
  color: ${({ theme }) => theme.color.white};
`

const ModeDescription = styled(Text)`
  font-size: 1.3rem;
  line-height: 1.857rem;
  color: ${({ theme }) => theme.color.foreground};
`

const Footer = styled(Box).attrs({
  align: "center",
  justifyContent: "space-between",
})`
  padding-top: 1.4rem;
  width: 100%;
`

const SetupButton = styled(Button).attrs({
  skin: "primary",
})`
  background: ${({ theme }) => theme.color.pinkDarker};
  margin-left: auto;
`

type Props = {
  triggerRef: React.RefObject<HTMLElement>
  onSetupClick: () => void
  showPromo: boolean
  setShowPromo: (show: boolean) => void
}

export const AIAssistantPromo = ({
  triggerRef,
  onSetupClick,
  showPromo,
  setShowPromo,
}: Props) => {
  const [container] = useState<HTMLElement>(document.createElement("div"))
  const transitionTimeoutId = useRef<number | undefined>()
  const [arrowElement, setArrowElement] = useState<HTMLElement | null>(null)
  const [popperElement, setPopperElement] = useState<HTMLElement | null>(null)
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
          key={promoKeyRef.current}
          classNames="fade-reg"
          in={positionReady}
          timeout={TransitionDuration.REG}
          unmountOnExit={false}
        >
          <TooltipContainer
            ref={setPopperElement}
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
            <Content>
              <Header>
                <AssistantTitle>
                  <AISparkle size={28} variant="filled" />
                  <TitleText>Meet QuestDB Assistant</TitleText>
                </AssistantTitle>
                <CloseButton onClick={handleClose} aria-label="Close">
                  <Close size="2rem" />
                </CloseButton>
              </Header>

              <Description>
                Our AI Assistant is a specialized programming and support agent
                that makes you more effective and helps you solve problems as
                you interface with your QuestDB database. It can help you in the
                following ways:
              </Description>

              <AssistantModes>
                <AssistantMode>
                  <IconContainer>
                    <ModeIcon
                      src="/assets/icon-generate-queries.svg"
                      alt="Generate Queries"
                    />
                  </IconContainer>
                  <ModeContent>
                    <ModeTitleRow>
                      <ModeTitle>Generate Queries</ModeTitle>
                    </ModeTitleRow>
                    <ModeDescription>
                      Create SQL queries from natural language, with
                      schema-aware context.
                    </ModeDescription>
                  </ModeContent>
                </AssistantMode>
                <AssistantMode>
                  <IconContainer>
                    <ModeIcon
                      src="/assets/icon-explain-queries.svg"
                      alt="Explain Queries"
                    />
                  </IconContainer>
                  <ModeContent>
                    <ModeTitleRow>
                      <ModeTitle>Explain Queries</ModeTitle>
                    </ModeTitleRow>
                    <ModeDescription>
                      Get an inline explanation of your query.
                    </ModeDescription>
                  </ModeContent>
                </AssistantMode>

                <AssistantMode>
                  <IconContainer>
                    <ModeIcon
                      src="/assets/icon-fix-queries.svg"
                      alt="Fix Queries"
                    />
                  </IconContainer>
                  <ModeContent>
                    <ModeTitle>Fix Queries</ModeTitle>
                    <ModeDescription>
                      Documentation-referenced suggestions to fix query errors.
                    </ModeDescription>
                  </ModeContent>
                </AssistantMode>

                <AssistantMode>
                  <IconContainer>
                    <ModeIcon
                      src="/assets/icon-explain-schema.svg"
                      alt="Explain Schema"
                    />
                  </IconContainer>
                  <ModeContent>
                    <ModeTitle>Explain Schema</ModeTitle>
                    <ModeDescription>
                      Detailed overview and structure of tables.
                    </ModeDescription>
                  </ModeContent>
                </AssistantMode>
              </AssistantModes>

              <Footer>
                <SetupButton onClick={handleSetupClick}>
                  Setup Assistant
                </SetupButton>
              </Footer>
            </Content>
          </TooltipContainer>
        </CSSTransition>,
        container,
      )}
    </>
  )
}
