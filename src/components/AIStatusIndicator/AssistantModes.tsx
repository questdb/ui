import React, { useMemo, useRef, useEffect } from "react"
import styled, { css } from "styled-components"
import { CheckboxCircle, CloseCircle } from "@styled-icons/remix-fill"
import { CircleNotchSpinner } from "../../scenes/Editor/Monaco/icons"
import {
  AIOperationStatus,
  type StatusArgs,
  type OperationHistory,
} from "../../providers/AIStatusProvider"
import { color } from "../../utils"
import { Box } from "../Box"

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  align-items: flex-start;
  width: 100%;
  min-height: 0;
`

const ModeHeader = styled.div<{ $abort: boolean }>`
  border: 1px solid ${color("selection")};
  border-radius: 0.4rem;
  display: flex;
  align-items: center;
  padding: 1rem 1.2rem;
  gap: 0.8rem;
  ${({ $abort }) =>
    $abort &&
    css`
      border-color: ${color("red")};
    `}
  width: 100%;
`

const ModeTitle = styled.div`
  font-weight: 500;
  font-size: 1.4rem;
  color: ${color("foreground")};
  text-align: center;
  margin-right: auto;
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
  operations: Array<{
    type: AIOperationStatus
    args?: StatusArgs
    content?: string
  }>
  abort: boolean
  startTimestamp: number
}

export const getIsExpandableSection = (section: OperationSection) => {
  return [
    AIOperationStatus.InvestigatingTable,
    AIOperationStatus.InvestigatingDocs,
    AIOperationStatus.Thinking,
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
        startTimestamp: op.timestamp,
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

export const formatDurationMs = (ms: number): string | null => {
  if (ms <= 0) return null
  if (ms < 1000) return `${ms}ms`
  return `${Math.round(ms / 1000)}s`
}

export const getSectionDuration = (
  section: OperationSection,
  nextSection: OperationSection | undefined,
  fallbackEndTimestamp?: number,
): string | null => {
  if (section.active || section.abort) return null
  const endTimestamp = nextSection?.startTimestamp ?? fallbackEndTimestamp
  if (!endTimestamp) return null
  return formatDurationMs(endTimestamp - section.startTimestamp)
}

const DurationText = styled.span`
  font-size: 1.2rem;
  font-family: ${({ theme }) => theme.fontMonospace};
  color: ${color("graphLegend")};
  font-weight: 400;
  flex-shrink: 0;
`

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
  const prevSectionCountRef = useRef(0)

  const operationSections = useMemo(
    () => buildOperationSections(operationHistory, status, isLive),
    [operationHistory, status, isLive],
  )

  useEffect(() => {
    if (isLive && operationSections.length > prevSectionCountRef.current) {
      onScrollNeeded?.()
    }
    prevSectionCountRef.current = operationSections.length
  }, [operationSections, isLive, onScrollNeeded])

  if (operationHistory.length === 0) {
    return null
  }

  return (
    <Container data-hook="assistant-modes-container">
      {operationSections.map((section, index) => {
        const nextSection: OperationSection | undefined =
          operationSections[index + 1]
        const sectionDuration = getSectionDuration(section, nextSection)

        return (
          <ModeHeader
            key={section.id}
            $abort={section.abort}
            data-hook={`assistant-mode-${section.type.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <ReasoningIcon>
              {section.active ? (
                <CircleNotchSpinner size={16} />
              ) : section.abort ? (
                <CloseCircleIcon size={16} />
              ) : (
                <CheckIcon />
              )}
            </ReasoningIcon>

            <Box align="flex-end" gap="0.3rem">
              <ModeTitle>{section.type}</ModeTitle>
              {sectionDuration && (
                <DurationText>({sectionDuration})</DurationText>
              )}
            </Box>
          </ModeHeader>
        )
      })}
    </Container>
  )
}
