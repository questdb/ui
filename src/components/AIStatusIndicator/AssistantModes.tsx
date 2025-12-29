import React, { useState, useMemo, useRef, useEffect } from "react"
import styled, { css } from "styled-components"
import { CheckboxCircle, CloseCircle } from "@styled-icons/remix-fill"
import { FileText, Table } from "@styled-icons/remix-line"
import { ChevronDown, ChevronRight } from "@styled-icons/boxicons-solid"
import { CircleNotchSpinner } from "../../scenes/Editor/Monaco/icons"
import {
  AIOperationStatus,
  type StatusArgs,
  type OperationHistory,
} from "../../providers/AIStatusProvider"
import { color } from "../../utils"
import { BrainIcon } from "../SetupAIAssistant/BrainIcon"

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  align-items: flex-start;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
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

const CheckIcon = styled(CheckboxCircle)`
  width: 1.6rem;
  height: 1.6rem;
  color: ${color("pink")};
  flex-shrink: 0;
`

const CloseCircleIcon = styled(CloseCircle)`
  color: ${color("red")};
  flex-shrink: 0;
`

export type OperationSection = {
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
    AIOperationStatus.Processing,
    AIOperationStatus.Compacting,
  ].includes(section.type)
}

export const buildOperationSections = (
  operationHistory: OperationHistory,
  currentStatus?: AIOperationStatus | null,
  isLive?: boolean,
): OperationSection[] => {
  const sections: OperationSection[] = []
  let currentSection: OperationSection | null = null

  for (const op of operationHistory) {
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
  if (isLive && lastSection && lastSection.type === currentStatus) {
    lastSection.active = true
  }
  if (lastSection && lastSection.type === AIOperationStatus.Aborted) {
    lastSection.active = false
  }

  return sections
}

type AssistantModesProps = {
  operationHistory: OperationHistory
  status?: AIOperationStatus | null
  isLive?: boolean
  onScrollNeeded?: () => void
}

export const AssistantModes: React.FC<AssistantModesProps> = ({
  operationHistory,
  status,
  isLive = false,
  onScrollNeeded,
}) => {
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({})
  const prevSectionCountRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const operationSections = useMemo(
    () => buildOperationSections(operationHistory, status, isLive),
    [operationHistory, status, isLive],
  )

  const prevIsLiveRef = useRef(isLive)

  useEffect(() => {
    // When operation completes (isLive goes from true to false), collapse all sections
    if (prevIsLiveRef.current && !isLive) {
      const allCollapsed: Record<string, boolean> = {}
      operationSections.forEach((section) => {
        allCollapsed[section.id] = true
      })
      setCollapsedSections(allCollapsed)
    }
    // During live operation, when a new section is added, collapse previous sections
    else if (isLive && operationSections.length > prevSectionCountRef.current) {
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
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }))
  }

  if (operationHistory.length === 0) {
    return null
  }

  return (
    <Container ref={containerRef} data-hook="assistant-modes-container">
      {operationSections.map((section, index) => {
        const isExpandable = getIsExpandableSection(section)
        const isLastSection = index === operationSections.length - 1
        const defaultExpanded = isLive ? isLastSection : true
        const isExpanded =
          collapsedSections[section.id] === undefined
            ? defaultExpanded && isExpandable
            : !collapsedSections[section.id] && isExpandable

        return (
          <ModeHeader
            key={section.id}
            $expanded={isExpanded}
            $abort={section.abort}
            data-hook={`assistant-mode-${section.type.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <ModeHeaderTop $expanded={isExpanded}>
              <ReasoningIcon>
                {section.active ? (
                  <CircleNotchSpinner size={16} />
                ) : section.abort ? (
                  <CloseCircleIcon size={16} />
                ) : (
                  <CheckIcon />
                )}
              </ReasoningIcon>

              <ModeTitle>{section.type}</ModeTitle>
              {isExpandable && (
                <ModeChevron onClick={() => handleToggleSection(section.id)}>
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
                          <ReasoningTextPart>{stepMessage}</ReasoningTextPart>
                        </ReasoningText>
                      </ReasoningItem>
                    )
                  }

                  if (op.type === AIOperationStatus.InvestigatingTableSchema) {
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
                        <React.Fragment key={opKey}>
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
                                      <ReasoningTextPart>in</ReasoningTextPart>
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
    </Container>
  )
}
