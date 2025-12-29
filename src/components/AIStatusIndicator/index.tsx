import React, { useState, useMemo, useRef, useEffect } from "react"
import styled, { css } from "styled-components"
import {
  CheckboxCircle,
  CloseCircle,
  Stop as StopFill,
} from "@styled-icons/remix-fill"
import { SidebarSimpleIcon, XIcon } from "@phosphor-icons/react"
import {
  useAIStatus,
  AIOperationStatus,
  isBlockingAIStatus,
} from "../../providers/AIStatusProvider"
import { color } from "../../utils"
import { slideAnimation } from "../Animation"
import { AISparkle } from "../AISparkle"
import { pinkLinearGradientHorizontal } from "../../theme"
import { MODEL_OPTIONS } from "../../utils/aiAssistantSettings"
import { useAIConversation } from "../../providers/AIConversationProvider"
import { Button } from "../../components/Button"
import { BrainIcon } from "../SetupAIAssistant/BrainIcon"
import { AssistantModes, buildOperationSections } from "./AssistantModes"
import { CircleNotchSpinner } from "../../scenes/Editor/Monaco/icons"
import { useSelector } from "react-redux"
import { selectors } from "../../store"

const CaretGradient = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    {...props}
  >
    <path
      d="M4.5 15L12 7.5L19.5 15"
      stroke="url(#paint0_linear_214_5568)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <defs>
      <linearGradient
        id="paint0_linear_214_5568"
        x1="12"
        y1="7.5"
        x2="12"
        y2="15"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#D14671" />
        <stop offset="1" stopColor="#892C6C" />
      </linearGradient>
    </defs>
  </svg>
)

const Container = styled.div`
  position: absolute;
  bottom: 2rem;
  right: 2rem;
  width: 38.3rem;
  background: ${color("backgroundDarker")};
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.8rem;
  padding: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  z-index: 1000;
  box-shadow: 0 0.4rem 1.2rem rgba(0, 0, 0, 0.3);
  max-height: 50vh;
`

const ChatStreaming = styled.div`
  background: ${color("backgroundLighter")};
  border-radius: 0.4rem;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 1rem;
  align-items: center;
  max-height: 13.8rem;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
`

const CloseButton = styled(Button).attrs({ skin: "transparent" })`
  width: 2.4rem;
  height: 2.4rem;
  padding: 0;
  flex-shrink: 0;

  &:hover {
    background: transparent !important;
    svg {
      color: ${color("foreground")};
    }
  }
`

const ChatStreamingOverlay = styled.div`
  background: linear-gradient(
    180deg,
    ${color("backgroundLighter")} 0%,
    rgba(40, 42, 54, 0) 60%
  );
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1001;
`

const ThoughtStreams = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  width: 32rem;
`

const ThoughtStream = styled.div<{
  $active: boolean
  $abort: boolean
  $level: number
}>`
  background: ${color("backgroundDarker")};
  border: 1px solid transparent;
  background:
    linear-gradient(${color("backgroundDarker")}, ${color("backgroundDarker")})
      padding-box,
    ${pinkLinearGradientHorizontal} border-box;
  ${({ $abort }) =>
    $abort &&
    css`
      background: ${color("red")};
    `}
  border-radius: 1rem;
  display: flex;
  gap: 0.8rem;
  align-items: center;
  padding: 0;
  height: 4.3rem;
  width: 32rem;
  position: relative;
  margin-bottom: ${({ $level }) => ($level ? `-1.2rem` : 0)};
  transition: transform 200ms;
  z-index: ${({ $active }) => ($active ? 10 : 1)};
  ${({ $level }) =>
    $level &&
    css`
      transform: scale(${1 - Math.abs($level) * 0.05});
      transform-origin: bottom center;
    `}
`

const ThoughtStreamContent = styled.div`
  display: flex;
  align-items: center;
  background: ${color("backgroundDarker")};
  gap: 0.8rem;
  width: 100%;
  height: 100%;
  border-radius: 1rem;
  padding: 0.95rem 1.2rem;
`

const CheckIcon = styled(CheckboxCircle)`
  width: 2.4rem;
  height: 2.4rem;
  color: ${color("pink")};
  flex-shrink: 0;
`

const CloseCircleIcon = styled(CloseCircle)`
  color: ${color("red")};
  flex-shrink: 0;
`

const ThoughtText = styled.div<{ $active: boolean }>`
  font-weight: 500;
  font-size: 1.6rem;
  color: ${color("gray2")};
  ${({ $active }) => $active && slideAnimation}
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  flex-shrink: 0;
`

const HeaderLeft = styled.div`
  display: flex;
  flex: 1 0 0;
  gap: 1rem;
  align-items: center;
  justify-content: flex-start;
  min-height: 0;
  min-width: 0;
`

const WorkingText = styled.div`
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.6rem;
  color: ${color("foreground")};
  text-transform: uppercase;
`

const AIStopButton = styled(Button)`
  width: 2.2rem;
  height: 2.2rem;
  flex-shrink: 0;
  border-radius: 100%;
  background: #da152832;
  border: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;

  &:hover {
    background: ${({ theme }) => theme.color.red} !important;
    svg {
      color: ${({ theme }) => theme.color.foreground};
    }
  }
`

const ViewChatButton = styled(Button).attrs({ skin: "transparent" })`
  gap: 1rem;
`

const ChevronButton = styled(Button).attrs({ skin: "transparent" })`
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.4rem;
  flex-shrink: 0;
  margin-right: 1rem;
  color: ${color("foreground")};

  &:hover {
    background: transparent !important;
    svg {
      filter: brightness(1.2);
    }
  }
`

const ExtendedThinkingLabel = styled.div`
  display: flex;
  gap: 0.8rem;
  align-items: center;
  justify-content: center;
  width: 100%;
  flex-shrink: 0;
`

const BrainIconWrapper = styled.div`
  width: 1.6rem;
  height: 1.6rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
`

const ExtendedThinkingText = styled.p`
  flex: 1 0 0;
  font-weight: 400;
  font-size: 1.1rem;
  color: ${color("gray2")};
  min-height: 0;
  min-width: 0;
  margin: 0;
`

const AssistantModesContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  align-items: flex-start;
  padding-top: 0.8rem;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  flex: 1 1 auto;
  max-height: 100%;
  box-shadow: inset 0 0.1rem 0.4rem rgba(0, 0, 0, 0.3);
`

export const AIStatusIndicator: React.FC = () => {
  const {
    status,
    currentOperation,
    currentModel,
    abortOperation,
    clearOperation,
  } = useAIStatus()
  const { chatWindowState, openChatWindow } = useAIConversation()
  const [expanded, setExpanded] = useState(true)
  const [isClosed, setIsClosed] = useState(false)
  const isCompleted = status === null && currentOperation.length > 0
  const isAborted = status === AIOperationStatus.Aborted
  const assistantModesRef = useRef<HTMLDivElement | null>(null)
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)
  const statusRef = useRef<AIOperationStatus | null>(null)
  const hasExtendedThinking = useMemo(() => {
    return MODEL_OPTIONS.find((model) => model.value === currentModel)?.isSlow
  }, [currentModel])

  const operationSections = useMemo(
    () => buildOperationSections(currentOperation, status, true),
    [currentOperation, status],
  )

  const handleToggleExpand = () => {
    setExpanded(!expanded)
    if (!expanded) {
      setTimeout(() =>
        assistantModesRef.current?.scrollTo({
          top: assistantModesRef.current.scrollHeight,
          behavior: "smooth",
        }),
      )
    }
  }

  const handleClose = () => {
    if (isCompleted) {
      clearOperation()
    }
    setIsClosed(true)
  }

  const handleScrollNeeded = () => {
    setTimeout(() =>
      assistantModesRef.current?.scrollTo({
        top: assistantModesRef.current.scrollHeight,
        behavior: "smooth",
      }),
    )
  }

  useEffect(() => {
    if (expanded) {
      handleScrollNeeded()
    }
  }, [operationSections, expanded])

  useEffect(() => {
    if (statusRef.current === null && status !== null) {
      setIsClosed(false)
    }
    if (status === null && activeSidebar === "aiChat") {
      clearOperation()
    }
    statusRef.current = status
  }, [status, activeSidebar, clearOperation])

  if (
    !currentOperation ||
    currentOperation.length === 0 ||
    isClosed ||
    activeSidebar === "aiChat"
  ) {
    return null
  }

  return (
    <Container data-hook="ai-status-indicator">
      <ChatStreaming>
        {operationSections.length > 1 && <ChatStreamingOverlay />}
        <ThoughtStreams>
          {operationSections.map((section, index) => (
            <ThoughtStream
              key={section.id}
              $active={section.active}
              $abort={section.abort}
              $level={index - (operationSections.length - 1)}
            >
              <ThoughtStreamContent>
                {section.active ? (
                  <CircleNotchSpinner size={24} />
                ) : section.abort ? (
                  <CloseCircleIcon size={24} />
                ) : (
                  <CheckIcon />
                )}
                <ThoughtText $active={section.active}>
                  {section.type}
                </ThoughtText>
              </ThoughtStreamContent>
            </ThoughtStream>
          ))}
        </ThoughtStreams>
      </ChatStreaming>
      <Header>
        <HeaderLeft>
          <AISparkle size={24} variant="filled" />
          <WorkingText>
            {isAborted ? "Cancelled" : isCompleted ? "Completed" : "Working..."}
          </WorkingText>
          {isBlockingAIStatus(status) && (
            <AIStopButton
              title="Cancel current operation"
              onClick={abortOperation}
              data-hook="ai-status-stop"
            >
              <StopFill size="14px" color="#da1e28" />
            </AIStopButton>
          )}
          {chatWindowState.activeConversationId && (
            <ViewChatButton
              onClick={() =>
                openChatWindow(chatWindowState.activeConversationId!)
              }
              data-hook="ai-status-view-chat"
            >
              View chat
              <SidebarSimpleIcon size={14} weight="fill" />
            </ViewChatButton>
          )}
        </HeaderLeft>
        <ChevronButton onClick={handleToggleExpand} type="button">
          {expanded ? (
            <CaretGradient style={{ transform: "rotate(180deg)" }} />
          ) : (
            <CaretGradient />
          )}
        </ChevronButton>
        {!isAborted && (
          <CloseButton skin="transparent" onClick={handleClose}>
            <XIcon size={16} weight="bold" />
          </CloseButton>
        )}
      </Header>

      {hasExtendedThinking && (
        <ExtendedThinkingLabel>
          <BrainIconWrapper>
            <BrainIcon />
          </BrainIconWrapper>
          <ExtendedThinkingText>
            Extended thinking model enabled. Responses may be slow.
          </ExtendedThinkingText>
        </ExtendedThinkingLabel>
      )}

      {expanded && (
        <AssistantModesContainer ref={assistantModesRef}>
          <AssistantModes
            operationHistory={currentOperation}
            status={status}
            isLive
            onScrollNeeded={handleScrollNeeded}
          />
        </AssistantModesContainer>
      )}
    </Container>
  )
}
