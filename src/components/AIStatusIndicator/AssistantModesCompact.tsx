import React, { useState, useMemo, useRef, useEffect } from "react"
import styled, { css, useTheme } from "styled-components"
import { CloseCircle } from "@styled-icons/remix-fill"
import { FileText, Table } from "@styled-icons/remix-line"
import { CheckIcon as CheckIconRaw } from "@phosphor-icons/react"
import { ChevronRight } from "@styled-icons/boxicons-solid"
import { CircleNotchSpinner } from "../../scenes/Editor/Monaco/icons"
import {
  AIOperationStatus,
  type StatusArgs,
  type OperationHistory,
} from "../../providers/AIStatusProvider"
import { color } from "../../utils"
import { BrainIcon } from "../SetupAIAssistant/BrainIcon"
import { buildOperationSections, type OperationSection } from "./AssistantModes"
import { slideAnimation } from "../../components/Animation"

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  align-items: flex-start;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
`

const ModeHeader = styled.div<{ $expanded: boolean; $abort: boolean }>`
  display: flex;
  flex-shrink: 0;
  width: 100%;

  ${({ $expanded }) =>
    $expanded
      ? css`
          flex-direction: column;
          align-items: flex-start;
        `
      : css`
          align-items: center;
          justify-content: space-between;
          padding: 0.4rem;
        `}
  ${({ $abort }) =>
    $abort &&
    css`
      opacity: 0.7;
    `}
  gap: 0.8rem;
`

const ModeChevron = styled.div<{ $expanded?: boolean }>`
  width: 1.4rem;
  height: 1.4rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${color("gray2")};
  margin-left: -0.3rem;
  cursor: pointer;
  transition:
    color 0.2s,
    transform 0.2s;
  transform: rotate(${({ $expanded }) => ($expanded ? "90deg" : "0deg")});
`

const ModeTitle = styled.div<{ $isActive: boolean; $isTopLevel?: boolean }>`
  font-weight: 500;
  font-size: 1.4rem;
  color: ${color("gray2")};
  text-align: center;
  margin-right: auto;
  transition: color 0.2s;
  flex-shrink: 0;

  ${({ $isActive }) => $isActive && slideAnimation}
  ${({ $isTopLevel }) =>
    $isTopLevel &&
    css`
      color: ${color("foreground")};
    `}
`

const ModeHeaderTop = styled.div<{
  $expanded: boolean
  $isExpandable?: boolean
}>`
  display: flex;
  gap: 0.8rem;
  align-items: center;
  flex-shrink: 0;
  ${({ $expanded }) =>
    $expanded &&
    css`
      padding: 0.4rem;
    `}
  ${({ $expanded }) =>
    !$expanded &&
    css`
      min-height: 0;
      min-width: 0;
    `}
  ${({ $isExpandable }) =>
    $isExpandable &&
    css`
      cursor: pointer;
      user-select: none;
      &:hover ${ModeTitle}, &:hover ${ModeChevron} {
        color: ${color("foreground")};
      }
    `}
`

const ExpandableWrapper = styled.div<{ $expanded: boolean }>`
  display: grid;
  grid-template-rows: ${({ $expanded }) => ($expanded ? "1fr" : "0fr")};
  transition:
    grid-template-rows 0.1s ease-out,
    opacity 0.3s ease-out;
  width: 100%;

  ${({ $expanded }) =>
    !$expanded &&
    css`
      height: 0;
      opacity: 0;
    `}
`

const ExpandableContent = styled.div`
  min-height: 0;
  overflow: hidden;
`

const ReasoningThread = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  align-items: flex-start;
  padding: 0 2.8rem;
`

const ReasoningItem = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.4rem;
  padding-left: 0;
`

const ReasoningIcon = styled.div`
  width: 1.4rem;
  height: 1.4rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${color("foreground")};
`

const ReasoningText = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  min-height: 0;
  min-width: 0;
`

const ReasoningTextPart = styled.span`
  font-weight: 400;
  font-size: 1.4rem;
  color: ${color("gray2")};
`

const CodeBadge = styled.div`
  background: ${color("background")};
  border: 1px solid ${color("selection")};
  border-radius: 0.4rem;
  padding: 0 0.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translateY(1px);
`

const CodeBadgeText = styled.span`
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.2rem;
  color: ${color("purple")};
`

const CheckIcon = styled(CheckIconRaw)`
  width: 1.6rem;
  height: 1.6rem;
  color: ${color("pink")};
  flex-shrink: 0;
`

const CloseCircleIcon = styled(CloseCircle)`
  color: ${color("red")};
  flex-shrink: 0;
`

const GradientCheckCircleIcon = ({ size = 20 }: { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 256 256"
    style={{ flexShrink: 0 }}
  >
    <defs>
      <linearGradient
        id="checkCircleGradient"
        x1="128"
        x2="128"
        y1="24"
        y2="232"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#d14671" />
        <stop offset="1" stopColor="#892c6c" />
      </linearGradient>
    </defs>
    <path
      fill="url(#checkCircleGradient)"
      d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,85.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z"
    />
  </svg>
)

const CollapsedSectionsWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding-left: 2.8rem;
`

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
  return [
    AIOperationStatus.InvestigatingTable,
    AIOperationStatus.InvestigatingDocs,
  ].includes(section.type)
}

type AssistantModesCompactProps = {
  operationHistory: OperationHistory
  status?: AIOperationStatus | null
  isLive?: boolean
  onScrollNeeded?: () => void
  collapsed?: boolean
  responseStart?: number
}

export const AssistantModesCompact: React.FC<AssistantModesCompactProps> = ({
  operationHistory,
  status,
  isLive = false,
  onScrollNeeded,
  collapsed = false,
  responseStart,
}) => {
  const theme = useTheme()
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({})
  const [collapsedProcessingExpanded, setCollapsedProcessingExpanded] =
    useState(false)
  const prevSectionCountRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const operationSections = useMemo(
    () => buildOperationSections(operationHistory, status, isLive),
    [operationHistory, status, isLive],
  )

  const prevIsLiveRef = useRef(isLive)

  useEffect(() => {
    if (prevIsLiveRef.current && !isLive) {
      const allCollapsed: Record<string, boolean> = {}
      operationSections.forEach((section) => {
        allCollapsed[section.id] = true
      })
      setCollapsedSections(allCollapsed)
    } else if (
      isLive &&
      operationSections.length > prevSectionCountRef.current
    ) {
      const newCollapsed: Record<string, boolean> = {}
      operationSections.forEach((section, index) => {
        if (index < operationSections.length - 1) {
          newCollapsed[section.id] = true
        }
      })
      setCollapsedSections(newCollapsed)
      onScrollNeeded?.()
    }
    prevSectionCountRef.current = operationSections.length
    prevIsLiveRef.current = isLive
  }, [operationSections, isLive, onScrollNeeded])

  const handleToggleSection = (sectionId: string) => {
    setCollapsedSections((prev) => {
      const section = operationSections.find((s) => s.id === sectionId)
      const isExpandable = section ? getIsExpandableSection(section) : false
      const sectionIndex = operationSections.findIndex(
        (s) => s.id === sectionId,
      )
      const isLastSection = sectionIndex === operationSections.length - 1
      const defaultExpanded = collapsed ? false : isLive ? isLastSection : true

      if (prev[sectionId] === undefined) {
        return {
          ...prev,
          [sectionId]: defaultExpanded && isExpandable,
        }
      }
      return {
        ...prev,
        [sectionId]: !prev[sectionId],
      }
    })
  }

  const durationText = useMemo(() => {
    if (operationHistory.length === 0) return null
    const firstTimestamp = operationHistory[0]?.timestamp
    if (!firstTimestamp || !responseStart) return null
    const durationMs = responseStart - firstTimestamp
    if (durationMs < 0) return null
    if (durationMs < 1000) {
      return `${durationMs}ms`
    }
    const seconds = Math.round(durationMs / 1000)
    return `${seconds}s`
  }, [operationHistory, responseStart])

  if (operationHistory.length === 0) {
    return null
  }

  const sectionsContent = operationSections.map((section, index) => {
    const isExpandable = getIsExpandableSection(section)
    const isLastSection = index === operationSections.length - 1
    const defaultExpanded = collapsed ? false : isLive ? isLastSection : true
    const isExpanded =
      collapsedSections[section.id] === undefined
        ? defaultExpanded && isExpandable
        : !collapsedSections[section.id] && isExpandable

    return (
      <ModeHeader
        key={section.id}
        $expanded={isExpanded}
        $abort={section.abort}
      >
        <ModeHeaderTop
          $expanded={isExpanded}
          $isExpandable={isExpandable}
          data-hook={`assistant-mode-${section.type.toLowerCase().replace(/\s+/g, "-")}`}
          role="presentation"
          onClick={
            isExpandable ? () => handleToggleSection(section.id) : undefined
          }
        >
          <ReasoningIcon>
            {section.active ? (
              <CircleNotchSpinner size={14} />
            ) : section.abort ? (
              <CloseCircleIcon size={14} />
            ) : (
              <CheckIcon />
            )}
          </ReasoningIcon>

          <ModeTitle $isActive={section.active}>{section.type}</ModeTitle>
          {isExpandable && (
            <ModeChevron $expanded={isExpanded}>
              <ChevronRight size={14} />
            </ModeChevron>
          )}
        </ModeHeaderTop>
        {isExpandable && (
          <ExpandableWrapper $expanded={isExpanded}>
            <ExpandableContent>
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
                            style={{ width: "14px", height: "14px" }}
                          />
                        </ReasoningIcon>
                        <ReasoningText>
                          <ReasoningTextPart>{stepMessage}</ReasoningTextPart>
                        </ReasoningText>
                      </ReasoningItem>
                    )
                  }

                  if (op.type === AIOperationStatus.InvestigatingTable) {
                    const tableName =
                      op.args && "name" in op.args ? op.args.name : "table"
                    const type =
                      op.args && "tableOpType" in op.args
                        ? op.args.tableOpType
                        : "details"
                    return (
                      <ReasoningItem key={opKey}>
                        <ReasoningIcon>
                          <Table size={14} color={theme.color.gray2} />
                        </ReasoningIcon>
                        <ReasoningText>
                          <ReasoningTextPart>Investigating</ReasoningTextPart>
                          <CodeBadge>
                            <CodeBadgeText>{tableName}</CodeBadgeText>
                          </CodeBadge>
                          <ReasoningTextPart>{type}</ReasoningTextPart>
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
                        <React.Fragment key={opKey}>
                          {items.map((item, itemIdx) => {
                            const itemKey = `${opKey}-item-${itemIdx}`
                            return (
                              <ReasoningItem key={itemKey}>
                                <ReasoningIcon>
                                  <FileText
                                    size={14}
                                    color={theme.color.gray2}
                                  />
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
                                      <ReasoningTextPart>in</ReasoningTextPart>
                                      <CodeBadge>
                                        <CodeBadgeText>
                                          {item.name}
                                        </CodeBadgeText>
                                      </CodeBadge>
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
                                    </>
                                  )}
                                </ReasoningText>
                              </ReasoningItem>
                            )
                          })}
                        </React.Fragment>
                      )
                    }

                    const name =
                      op.args && "name" in op.args ? op.args.name : null
                    const docSection =
                      op.args && "section" in op.args ? op.args.section : null
                    return (
                      <ReasoningItem key={opKey}>
                        <ReasoningIcon>
                          <FileText size={14} />
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
            </ExpandableContent>
          </ExpandableWrapper>
        )}
      </ModeHeader>
    )
  })

  if (collapsed) {
    return (
      <Container ref={containerRef} data-hook="assistant-modes-container">
        <ModeHeader $expanded={collapsedProcessingExpanded} $abort={false}>
          <ModeHeaderTop
            $expanded={collapsedProcessingExpanded}
            $isExpandable
            onClick={() => setCollapsedProcessingExpanded((prev) => !prev)}
            data-hook="assistant-mode-processing-collapsed"
            role="presentation"
          >
            <GradientCheckCircleIcon size={20} />
            <ModeTitle $isActive={false}>
              {durationText ? `Thought for ${durationText}` : "Thought"}
            </ModeTitle>
            <ModeChevron $expanded={collapsedProcessingExpanded}>
              <ChevronRight size={14} />
            </ModeChevron>
          </ModeHeaderTop>
          <ExpandableWrapper $expanded={collapsedProcessingExpanded}>
            <ExpandableContent>
              <CollapsedSectionsWrapper>
                {sectionsContent}
              </CollapsedSectionsWrapper>
            </ExpandableContent>
          </ExpandableWrapper>
        </ModeHeader>
      </Container>
    )
  }

  return (
    <Container ref={containerRef} data-hook="assistant-modes-container">
      {sectionsContent}
    </Container>
  )
}
