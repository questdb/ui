import React, { useCallback, useEffect, useRef, useState } from "react"
import ReactDOM from "react-dom"
import { CSSTransition } from "react-transition-group"
import styled from "styled-components"
import { Close } from "../icons"
import {
  CaretDownIcon,
  CaretUpIcon,
  ChartBarIcon,
  ChartLineUpIcon,
  MinusCircleIcon,
  PulseIcon,
  StethoscopeIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react"
import { Button, ButtonBase } from "../Button"
import { glassLens } from "../SegmentedControl"
import { IconButton } from "../IconButton"
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
      ${({ theme }) => theme.color.borderSubtle} 100%
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
  /* The shadow already sets the popover apart; a softer edge than other
     floating surfaces keeps the card inside it in front. */
  border-color: ${({ theme }) => theme.color.borderSubtle};
  width: 34rem;
  padding: 0.4rem;
  border-radius: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
`

// The card with the header and the features, inset in the popover.
const Card = styled.div`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 0.6rem;
  background: ${({ theme }) => theme.color.surfaceBase};
  box-shadow: 0 0 0 1px ${({ theme }) => theme.color.borderSubtle};
`

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 1.2rem;
  padding: 1.2rem;
  background: ${({ theme }) => theme.color.surfaceInset};
  border: 1px solid ${({ theme }) => theme.color.borderSubtle};
  border-top: none;
  border-radius: 0.6rem 0.6rem 0.8rem 0.8rem;
`

// The glass lens of the side panels' selected buttons, like the AI
// Assistant button this promo points at.
const HeaderIcon = styled.div`
  ${glassLens}
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 4rem;
  height: 4rem;
  border-radius: 0.6rem;
`

const HeaderText = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
`

const Title = styled.span`
  font-size: 1.5rem;
  font-weight: 500;
  line-height: 2.1rem;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const Subtitle = styled.span`
  font-size: 1.5rem;
  line-height: 2.1rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const CloseButton = styled(IconButton).attrs({
  label: "Close",
  variant: "ghost",
  size: "sm",
})`
  padding: 0.4rem;
`

const Row = styled.div`
  display: flex;
  flex-direction: column;
  padding: 1rem 1.2rem;

  & + & {
    border-top: 1px solid ${({ theme }) => theme.color.borderSubtle};
  }
`

const StatusRow = styled(Row)`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  min-height: 4.4rem;
  padding-top: 0;
  padding-bottom: 0;
`

const Term = styled.span`
  font-size: 1.5rem;
  font-weight: 500;
  line-height: 2.1rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const StatusPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  height: 2.4rem;
  padding: 0 0.8rem 0 0.6rem;
  border-radius: 1.2rem;
  font-size: 1.2rem;
  font-weight: 500;
  color: ${({ theme }) => theme.color.contentSecondary};
  background: ${({ theme }) => theme.color.surfaceInset};
`

const FeatureToggle = styled(ButtonBase)<{ $open: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 1.5rem;
  font-weight: 500;
  line-height: 2.1rem;
  color: ${({ theme, $open }) =>
    $open ? theme.color.contentPrimary : theme.color.contentSecondary};

  &:hover {
    color: ${({ theme }) => theme.color.contentPrimary};
  }
`

const FeatureName = styled.span<{ $open: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.8rem;

  svg {
    flex-shrink: 0;
    color: ${({ theme, $open }) =>
      $open ? theme.color.contentAccentStrong : theme.color.contentSecondary};
  }
`

const Caret = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.8rem;
  height: 2.8rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

// Slides the description open and closed: the grid row grows from 0 to the
// content's height.
const Collapse = styled.div<{ $open: boolean }>`
  display: grid;
  grid-template-rows: ${({ $open }) => ($open ? "1fr" : "0fr")};
  opacity: ${({ $open }) => ($open ? 1 : 0)};
  transition:
    grid-template-rows 200ms ease,
    opacity 200ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  & > * {
    overflow: hidden;
    min-height: 0;
  }
`

const FeatureDescription = styled.p`
  margin: 0;
  padding-top: 0.8rem;
  padding-right: 2.8rem;
  font-size: 1.3rem;
  line-height: 1.8rem;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
`

const PrimaryAction = styled(Button).attrs({ variant: "primary" })`
  flex: 1;
`

type Feature = {
  key: string
  name: string
  description: string
  Icon: PhosphorIcon
}

// What the coding agent does in the console. One opens at a time.
const FEATURES: Feature[] = [
  {
    key: "dashboards",
    name: "Build Dashboards",
    description:
      "Turn a question into a notebook of queries and charts, laid out as a live dashboard.",
    Icon: ChartBarIcon,
  },
  {
    key: "analysis",
    name: "Analyze Data",
    description:
      "Ask about trends, outliers and patterns. It writes and runs the queries for you.",
    Icon: ChartLineUpIcon,
  },
  {
    key: "monitoring",
    name: "Monitor Your Instance",
    description:
      "Keep an eye on ingestion, query load and storage, and see what changed.",
    Icon: PulseIcon,
  },
  {
    key: "health",
    name: "Diagnose Health Issues",
    description: "Find out why a table is unhealthy and how to fix it.",
    Icon: StethoscopeIcon,
  },
]

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
  const [openFeature, setOpenFeature] = useState<string | null>(FEATURES[0].key)

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
              <Card>
                <Header>
                  <HeaderIcon>
                    <AISparkle size={24} variant="filled" />
                  </HeaderIcon>
                  <HeaderText>
                    <Title>Set up the AI Assistant</Title>
                    <Subtitle>Drive Web Console with AI.</Subtitle>
                  </HeaderText>
                  <CloseButton
                    onClick={handleClose}
                    aria-label="Close"
                    data-hook="ai-promo-close"
                  >
                    <Close size="1.8rem" />
                  </CloseButton>
                </Header>

                <div>
                  <StatusRow>
                    <Term>Status</Term>
                    <StatusPill data-hook="ai-promo-status">
                      <MinusCircleIcon size={16} weight="fill" />
                      Disabled
                    </StatusPill>
                  </StatusRow>
                  {FEATURES.map(({ key, name, description, Icon }) => {
                    const open = openFeature === key
                    return (
                      <Row key={key}>
                        <FeatureToggle
                          type="button"
                          $open={open}
                          aria-expanded={open}
                          onClick={() => setOpenFeature(open ? null : key)}
                          data-hook={`ai-promo-feature-${key}`}
                        >
                          <FeatureName $open={open}>
                            <Icon size={18} />
                            {name}
                          </FeatureName>
                          <Caret>
                            {open ? (
                              <CaretUpIcon size={18} />
                            ) : (
                              <CaretDownIcon size={18} />
                            )}
                          </Caret>
                        </FeatureToggle>
                        <Collapse $open={open} aria-hidden={!open}>
                          <div>
                            <FeatureDescription>
                              {description}
                            </FeatureDescription>
                          </div>
                        </Collapse>
                      </Row>
                    )
                  })}
                </div>
              </Card>

              <Actions>
                <Button
                  variant="secondary"
                  onClick={handleSetupClick}
                  data-hook="ai-promo-continue"
                >
                  Use an API key
                </Button>
                <PrimaryAction
                  onClick={handleConnectAgentClick}
                  data-hook="ai-promo-connect-agent"
                >
                  Connect your agent
                </PrimaryAction>
              </Actions>
            </Content>
          </TooltipContainer>
        </CSSTransition>,
        container,
      )}
    </>
  )
}
