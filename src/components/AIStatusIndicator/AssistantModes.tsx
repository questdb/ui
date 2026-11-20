import React, { useMemo, useRef, useEffect } from "react"
import styled, { css } from "styled-components"
import { XIcon } from "@phosphor-icons/react"
import { CheckboxCircle } from "../icons"
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
  border: 1px solid ${color("interactionNeutral")};
  border-radius: 0.4rem;
  display: flex;
  align-items: center;
  padding: 1rem 1.2rem;
  gap: 0.8rem;
  ${({ $abort }) =>
    $abort &&
    css`
      border-color: ${color("statusDanger")};
    `}
  width: 100%;
`

const ModeTitle = styled.div`
  font-weight: 500;
  font-size: 1.4rem;
  color: ${color("contentPrimary")};
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
  color: ${color("contentPrimary")};
`

const CheckIcon = styled(CheckboxCircle)`
  width: 1.6rem;
  height: 1.6rem;
  color: ${color("aiPinkStart")};
  flex-shrink: 0;
`

const FailedIcon = styled(XIcon)`
  width: 1.6rem;
  height: 1.6rem;
  color: ${color("statusDanger")};
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
    endedAt?: number
  }>
  abort: boolean
  // The section's latest step failed.
  failed: boolean
  startTimestamp: number
  // When the last of its steps' tools finished, once all of them have.
  endedAt?: number
}

export const hasFailedStep = (section: OperationSection) =>
  section.operations.some((op) => op.args?.failed !== undefined)

export const getIsExpandableSection = (section: OperationSection) => {
  if (hasFailedStep(section)) return true
  return [
    AIOperationStatus.InvestigatingTable,
    AIOperationStatus.InvestigatingDocs,
    AIOperationStatus.Thinking,
    AIOperationStatus.RunningQuery,
    AIOperationStatus.ValidatingQuery,
    AIOperationStatus.UsingAgentTools,
    AIOperationStatus.Planning,
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
        failed: false,
        operations: [op],
        startTimestamp: op.timestamp,
      }
      sections.push(currentSection)
    } else {
      currentSection.operations.push(op)
    }
  }

  for (const section of sections) {
    section.failed =
      section.operations[section.operations.length - 1]?.args?.failed !==
      undefined
    const ends = section.operations.map((op) => op.endedAt)
    if (ends.every((end): end is number => end !== undefined)) {
      section.endedAt = Math.max(...ends)
    }
  }

  // A failed or finished step has ended, even while its status is still the
  // latest.
  const lastSection = sections[sections.length - 1]
  if (
    isLive &&
    lastSection &&
    lastSection.type === currentStatus &&
    !lastSection.failed &&
    lastSection.endedAt === undefined
  ) {
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
  // A plan is a list, not work that takes time.
  if (section.type === AIOperationStatus.Planning) return null
  // A step that reported its end shows its own time; the time until the next
  // step is the model's, not the tool's.
  const endTimestamp =
    section.endedAt ?? nextSection?.startTimestamp ?? fallbackEndTimestamp
  if (!endTimestamp) return null
  return formatDurationMs(endTimestamp - section.startTimestamp)
}

const DurationText = styled.span`
  font-size: 1.2rem;
  font-family: ${({ theme }) => theme.fontMonospace};
  color: ${color("contentMuted")};
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
              ) : section.abort || section.failed ? (
                <FailedIcon />
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
