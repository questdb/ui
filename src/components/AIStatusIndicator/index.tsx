import React, { useState, useMemo, useRef, useEffect } from "react"
import styled, { css } from "styled-components"
import {
  CheckboxCircle,
  CloseCircle,
  Stop as StopFill,
} from "@styled-icons/remix-fill"
import { FileText, Table } from "@styled-icons/remix-line"
import { SidebarSimpleIcon, XIcon } from "@phosphor-icons/react"
import { ChevronDown, ChevronRight } from "@styled-icons/boxicons-solid"
import {
  useAIStatus,
  AIOperationStatus,
  StatusArgs,
  isBlockingAIStatus,
} from "../../providers/AIStatusProvider"
import { color } from "../../utils"
import { slideAnimation, spinAnimation } from "../Animation"
import { BrainIcon } from "../SetupAIAssistant/BrainIcon"
import { AISparkle } from "../AISparkle"
import { pinkLinearGradientHorizontal } from "../../theme"
import { MODEL_OPTIONS } from "../../utils/aiAssistantSettings"
import { useAIConversation } from "../../providers/AIConversationProvider"
import { Button } from "../../components/Button"

const CircleNotch = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    {...props}
  >
    <path
      d="M15.75 3.75C17.32 4.48224 18.6482 5.64772 19.5783 7.10926C20.5084 8.57081 21.0016 10.2676 21 12C21 14.3869 20.0518 16.6761 18.364 18.364C16.6761 20.0518 14.387 21 12 21C9.61306 21 7.32387 20.0518 5.63604 18.364C3.94822 16.6761 3 14.3869 3 12C2.99838 10.2676 3.49163 8.57081 4.4217 7.10926C5.35178 5.64772 6.67998 4.48224 8.25 3.75"
      stroke="url(#paint0_linear_140_9487)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <defs>
      <linearGradient
        id="paint0_linear_140_9487"
        x1="12"
        y1="3.75"
        x2="12"
        y2="21"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#D14671" />
        <stop offset="1" stopColor="#892C6C" />
      </linearGradient>
    </defs>
  </svg>
)

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

const SpinnerIcon = styled(CircleNotch)`
  width: 2.4rem;
  height: 2.4rem;
  ${spinAnimation};
  flex-shrink: 0;
  transform-origin: center;
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

const AssistantModes = styled.div`
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

const ModeHeader = styled.div<{ $expanded: boolean; $abort: boolean }>`
  border: 1px solid ${color("selection")};
  border-radius: 0.4rem;
  display: flex;
  ${({ $expanded }) =>
    $expanded
      ? css`
          flex-direction: column;
          align-items: flex-start;
        `
      : css`
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.2rem;
        `}
  ${({ $abort }) =>
    $abort &&
    css`
      border-color: ${color("red")};
    `}
  width: 100%;
`

const ModeHeaderTop = styled.div<{ $expanded: boolean }>`
  display: flex;
  gap: 1rem;
  align-items: center;
  ${({ $expanded }) =>
    $expanded &&
    css`
      border-bottom: 1px solid ${color("selection")};
      padding: 1rem 1.2rem;
      width: 100%;
    `}
  ${({ $expanded }) =>
    !$expanded &&
    css`
      flex: 1 0 0;
      min-height: 0;
      min-width: 0;
    `}
`

const ModeChevron = styled.div`
  width: 1.6rem;
  height: 1.6rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${color("foreground")};
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }
`

const ModeTitle = styled.div`
  font-weight: 500;
  font-size: 1.4rem;
  color: ${color("foreground")};
  text-align: center;
  margin-right: auto;
`

const ReasoningThread = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: flex-start;
  padding: 1rem 1.2rem;
  width: 100%;
`

const ReasoningItem = styled.div`
  display: flex;
  gap: 1rem;
  align-items: center;
  padding: 0.2rem 0.6rem;
  padding-left: 0;
  width: 100%;
`

const ReasoningIcon = styled.div`
  width: 1.6rem;
  height: 1.6rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${color("foreground")};
`

const ReasoningText = styled.div`
  display: flex;
  flex: 1 0 0;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  min-height: 0;
  min-width: 0;
`

const ReasoningTextPart = styled.span`
  font-weight: 400;
  font-size: 1.3rem;
  color: ${color("gray2")};
`

const CodeBadge = styled.div`
  background: #2d303e;
  border: 1px solid #44475a;
  border-radius: 0.6rem;
  padding: 0.2rem 0.6rem;
  display: flex;
  gap: 1rem;
  align-items: center;
  position: relative;
`

const CodeBadgeText = styled.span`
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.3rem;
  color: #9089fc;
`

type OperationSection = {
  id: string
  type: AIOperationStatus
  active: boolean
  operations: Array<{ type: AIOperationStatus; args?: StatusArgs }>
  abort: boolean
}

const formatDetailedStatusMessage = (
  status: AIOperationStatus,
  args?: StatusArgs,
): string => {
  if (status === AIOperationStatus.Processing && args && "type" in args) {
    switch (args.type) {
      case "fix":
        return "Processing fix request"
      case "explain":
        return "Processing explain request"
      default:
        return status
    }
  }
  return status
}

const getIsExpandableSection = (section: OperationSection) => {
  return ![
    AIOperationStatus.RetrievingTables,
    AIOperationStatus.RetrievingDocumentation,
    AIOperationStatus.Aborted,
    AIOperationStatus.ValidatingQuery,
  ].includes(section.type)
}

export const AIStatusIndicator: React.FC = () => {
  const {
    status,
    currentOperation,
    currentModel,
    abortOperation,
    activeConversationId,
    clearOperation,
  } = useAIStatus()
  const { chatWindowState, openChatWindow } = useAIConversation()
  const [expanded, setExpanded] = useState(true)
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({})
  const [isClosed, setIsClosed] = useState(false)
  const isCompleted = status === null && currentOperation.length > 0
  const isAborted = status === AIOperationStatus.Aborted
  const assistantModesRef = useRef<HTMLDivElement | null>(null)
  const isChatWindowOpen = chatWindowState.isOpen
  const statusRef = useRef<AIOperationStatus | null>(null)
  const hasExtendedThinking = useMemo(() => {
    return MODEL_OPTIONS.find((model) => model.value === currentModel)?.isSlow
  }, [currentModel])

  const operationSections = useMemo(() => {
    const sections: OperationSection[] = []
    let currentSection: OperationSection | null = null

    for (const op of currentOperation) {
      const sectionType = op.type
      if (!currentSection || currentSection.type !== sectionType) {
        currentSection = {
          id: `section-${sections.length}-${sectionType}`,
          type: sectionType,
          active: false,
          abort: sectionType === AIOperationStatus.Aborted,
          operations: [op],
        }
        sections.push(currentSection)
      } else {
        currentSection.operations.push(op)
      }
    }
    const lastSection = sections[sections.length - 1]
    if (lastSection && lastSection.type === status) {
      lastSection.active = true
    }
    if (lastSection && lastSection.type === AIOperationStatus.Aborted) {
      lastSection.active = false
    }

    return sections
  }, [currentOperation, status])

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

  const handleToggleSection = (sectionId: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }))
  }

  const handleClose = () => {
    if (isCompleted) {
      clearOperation()
    }
    setIsClosed(true)
  }

  useEffect(() => {
    if (expanded) {
      setTimeout(() =>
        assistantModesRef.current?.scrollTo({
          top: assistantModesRef.current.scrollHeight,
          behavior: "smooth",
        }),
      )
    }
  }, [operationSections, expanded])

  useEffect(() => {
    if (statusRef.current === null && status !== null) {
      setIsClosed(false)
    }
    if (status === null && chatWindowState.isOpen) {
      clearOperation()
    }
    statusRef.current = status
  }, [status, chatWindowState.isOpen, clearOperation])

  if (
    !currentOperation ||
    currentOperation.length === 0 ||
    isClosed ||
    isChatWindowOpen
  ) {
    return null
  }

  return (
    <Container>
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
                  <SpinnerIcon />
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
            >
              <StopFill size="14px" color="#da1e28" />
            </AIStopButton>
          )}
          {activeConversationId && (
            <ViewChatButton
              onClick={() => openChatWindow(activeConversationId)}
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
        <AssistantModes ref={assistantModesRef}>
          {operationSections.map((section) => {
            const isExpandable = getIsExpandableSection(section)
            const isExpanded =
              collapsedSections[section.id] !== true && isExpandable

            return (
              <ModeHeader
                key={section.id}
                $expanded={isExpanded}
                $abort={section.abort}
              >
                <ModeHeaderTop $expanded={isExpanded}>
                  <ReasoningIcon>
                    {section.active ? (
                      <SpinnerIcon style={{ width: "16px", height: "16px" }} />
                    ) : section.abort ? (
                      <CloseCircleIcon size={16} />
                    ) : (
                      <CheckIcon style={{ width: "16px", height: "16px" }} />
                    )}
                  </ReasoningIcon>

                  <ModeTitle>{section.type}</ModeTitle>
                  {isExpandable && (
                    <ModeChevron
                      onClick={() => handleToggleSection(section.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </ModeChevron>
                  )}
                </ModeHeaderTop>
                {isExpanded && (
                  <ReasoningThread>
                    {section.operations.map((op, idx) => {
                      const opKey = `${section.id}-${idx}-${JSON.stringify(op.args)}`

                      if (op.type === AIOperationStatus.Processing) {
                        const stepMessage = formatDetailedStatusMessage(
                          op.type,
                          op.args,
                        )
                        return (
                          <ReasoningItem key={opKey}>
                            <ReasoningIcon>
                              <BrainIcon
                                style={{ width: "16px", height: "16px" }}
                              />
                            </ReasoningIcon>
                            <ReasoningText>
                              <ReasoningTextPart>
                                {stepMessage}
                              </ReasoningTextPart>
                            </ReasoningText>
                          </ReasoningItem>
                        )
                      }

                      if (
                        op.type === AIOperationStatus.InvestigatingTableSchema
                      ) {
                        const tableName =
                          op.args && "name" in op.args ? op.args.name : "table"
                        return (
                          <ReasoningItem key={opKey}>
                            <ReasoningIcon>
                              <Table size={16} />
                            </ReasoningIcon>
                            <ReasoningText>
                              <ReasoningTextPart>Reading</ReasoningTextPart>
                              <CodeBadge>
                                <CodeBadgeText>{tableName}</CodeBadgeText>
                              </CodeBadge>
                              <ReasoningTextPart>schema</ReasoningTextPart>
                            </ReasoningText>
                          </ReasoningItem>
                        )
                      }

                      if (op.type === AIOperationStatus.InvestigatingDocs) {
                        const items =
                          op.args &&
                          "items" in op.args &&
                          Array.isArray(op.args.items)
                            ? op.args.items
                            : null

                        if (items && items.length > 0) {
                          return (
                            <>
                              {items.map((item, itemIdx) => {
                                const itemKey = `${opKey}-item-${itemIdx}`
                                return (
                                  <ReasoningItem key={itemKey}>
                                    <ReasoningIcon>
                                      <FileText size={16} />
                                    </ReasoningIcon>
                                    <ReasoningText>
                                      {item.section ? (
                                        <>
                                          <ReasoningTextPart>
                                            Investigating
                                          </ReasoningTextPart>
                                          <CodeBadge>
                                            <CodeBadgeText>
                                              {item.section}
                                            </CodeBadgeText>
                                          </CodeBadge>
                                          <ReasoningTextPart>
                                            in
                                          </ReasoningTextPart>
                                          <CodeBadge>
                                            <CodeBadgeText>
                                              {item.name}
                                            </CodeBadgeText>
                                          </CodeBadge>
                                          <ReasoningTextPart>
                                            documentation
                                          </ReasoningTextPart>
                                        </>
                                      ) : (
                                        <>
                                          <ReasoningTextPart>
                                            Investigating
                                          </ReasoningTextPart>
                                          <CodeBadge>
                                            <CodeBadgeText>
                                              {item.name}
                                            </CodeBadgeText>
                                          </CodeBadge>
                                          <ReasoningTextPart>
                                            documentation
                                          </ReasoningTextPart>
                                        </>
                                      )}
                                    </ReasoningText>
                                  </ReasoningItem>
                                )
                              })}
                            </>
                          )
                        }

                        const name =
                          op.args && "name" in op.args ? op.args.name : null
                        const docSection =
                          op.args && "section" in op.args
                            ? op.args.section
                            : null
                        return (
                          <ReasoningItem key={opKey}>
                            <ReasoningIcon>
                              <FileText size={16} />
                            </ReasoningIcon>
                            <ReasoningText>
                              {name && docSection ? (
                                <>
                                  <ReasoningTextPart>
                                    Investigating
                                  </ReasoningTextPart>
                                  <CodeBadge>
                                    <CodeBadgeText>{docSection}</CodeBadgeText>
                                  </CodeBadge>
                                  <ReasoningTextPart>in</ReasoningTextPart>
                                  <CodeBadge>
                                    <CodeBadgeText>{name}</CodeBadgeText>
                                  </CodeBadge>
                                  <ReasoningTextPart>
                                    documentation
                                  </ReasoningTextPart>
                                </>
                              ) : name ? (
                                <>
                                  <ReasoningTextPart>
                                    Investigating
                                  </ReasoningTextPart>
                                  <CodeBadge>
                                    <CodeBadgeText>{name}</CodeBadgeText>
                                  </CodeBadge>
                                  <ReasoningTextPart>
                                    documentation
                                  </ReasoningTextPart>
                                </>
                              ) : (
                                <ReasoningTextPart>
                                  Investigating documentation
                                </ReasoningTextPart>
                              )}
                            </ReasoningText>
                          </ReasoningItem>
                        )
                      }

                      return null
                    })}
                  </ReasoningThread>
                )}
              </ModeHeader>
            )
          })}
        </AssistantModes>
      )}
    </Container>
  )
}
