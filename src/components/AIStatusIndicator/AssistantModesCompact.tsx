import { CircleDashedIcon } from "@phosphor-icons/react"
import React, { useState, useMemo, useRef, useEffect } from "react"
import styled, { css, useTheme } from "styled-components"
import { Table } from "../icons"
import {
  CheckIcon as CheckIconRaw,
  FileTextIcon,
  XIcon,
} from "@phosphor-icons/react"
import { AgentToolIcon } from "./AgentToolIcon"
import { AgentToolDetails } from "./AgentToolDetails"
import { PlanList } from "./PlanList"
import { ChevronRight } from "../icons"
import { CircleNotchSpinner } from "../../scenes/Editor/Monaco/icons"
import {
  AIOperationStatus,
  type StatusArgs,
  type OperationHistory,
} from "../../providers/AIStatusProvider"
import { color } from "../../utils"
import { statusInfoFocus } from "../../theme"
import { BrainIcon } from "../SetupAIAssistant/BrainIcon"
import {
  buildOperationSections,
  formatDurationMs,
  getIsExpandableSection,
  getSectionDuration,
  type OperationSection,
} from "./AssistantModes"
import { slideAnimation } from "../Animation"
import { Box } from "../Box"
import { CopyButton } from "../CopyButton"

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
  align-self: center;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${color("contentSecondary")};
  cursor: pointer;
  transition:
    color 0.2s,
    transform 0.2s;
  transform: rotate(${({ $expanded }) => ($expanded ? "90deg" : "0deg")});
`

const ModeTitle = styled.div<{ $isActive: boolean; $isTopLevel?: boolean }>`
  font-weight: 500;
  font-size: 1.4rem;
  color: ${color("contentSecondary")};
  text-align: center;
  margin-right: auto;
  transition: color 0.2s;
  flex-shrink: 0;

  ${({ $isActive }) => $isActive && slideAnimation}
  ${({ $isTopLevel }) =>
    $isTopLevel &&
    css`
      color: ${color("contentPrimary")};
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
      border-radius: 0.4rem;
      transition: background-color 120ms ease;

      &:hover {
        background: ${color("surfaceRaised")};
      }

      &:focus-visible {
        outline: 1px solid
          ${({ theme }) => statusInfoFocus(theme.color.statusInfo)};
        outline-offset: 2px;
      }

      &:hover ${ModeTitle}, &:hover ${ModeChevron} {
        color: ${color("contentPrimary")};
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
  min-width: 0;
`

const ReasoningItem = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  max-width: 100%;
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
  color: ${color("contentPrimary")};
`

const ToolStep = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
`

const ToolStepToggle = styled.div`
  display: flex;
  max-width: 100%;
  min-width: 0;
  cursor: pointer;
  border-radius: 0.4rem;

  &:focus-visible {
    outline: 1px solid ${({ theme }) => statusInfoFocus(theme.color.statusInfo)};
    outline-offset: 2px;
  }

  &:hover svg {
    color: ${color("contentPrimary")};
  }
`

const ToolStepChevron = styled.span<{ $expanded: boolean }>`
  display: inline-flex;
  align-items: center;
  align-self: center;
  flex-shrink: 0;
  color: ${color("contentSecondary")};
  transition: transform 0.2s;
  transform: rotate(${({ $expanded }) => ($expanded ? "90deg" : "0deg")});
`

// A command as the agent ran it, line breaks and all. A long one scrolls
// instead of being cut off.
const CommandItem = styled(ReasoningItem)`
  align-items: flex-start;

  ${ReasoningIcon} {
    height: 2rem;
  }
`

const CommandText = styled.pre`
  margin: 0;
  min-width: 0;
  max-height: 16rem;
  overflow: auto;
  padding: 0.1rem 0.6rem;
  background: ${color("surfaceRaised")};
  border: 1px solid ${color("interactionNeutral")};
  border-radius: 0.4rem;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.2rem;
  line-height: 1.6rem;
  color: ${color("statusFeature")};
  white-space: pre;
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
  color: ${color("contentSecondary")};
`

const CodeBadge = styled.div`
  background: ${color("surfaceRaised")};
  border: 1px solid ${color("interactionNeutral")};
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
  color: ${color("statusFeature")};
`

const CheckIcon = styled(CheckIconRaw)`
  width: 1.6rem;
  height: 1.6rem;
  color: ${color("aiPinkStart")};
  flex-shrink: 0;
`

// A plain cross, like the check of a finished step.
const FailedIcon = styled(XIcon)`
  width: 1.6rem;
  height: 1.6rem;
  color: ${color("statusDanger")};
  flex-shrink: 0;
`

const CollapsedSectionsWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding-left: 2.8rem;
`

const DurationText = styled.span`
  font-size: 1.2rem;
  color: ${color("contentMuted")};
  font-family: ${({ theme }) => theme.fontMonospace};
  font-weight: 400;
  flex-shrink: 0;
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

const ThinkingContent = styled.div`
  font-size: 1.3rem;
  color: ${color("contentSecondary")};
  padding: 0 2.8rem;
  white-space: pre-wrap;
  word-break: break-word;
  opacity: 0.7;
`

const FailureText = styled.div`
  padding-left: 1.9rem;
  font-size: 1.3rem;
  line-height: 1.5;
  color: ${color("statusDanger")};
  white-space: pre-wrap;
  word-break: break-word;
`

// Why a step failed, under the step. A step with no detail of its own, like
// listing tables, names the step first.
const StepFailure = ({
  op,
}: {
  op: OperationSection["operations"][number]
}) => {
  const detail = op.args?.failed || "Failed"
  return (
    <FailureText role="status" data-hook="assistant-mode-step-failure">
      {hasStepDetails(op) ? detail : `${op.type} failed: ${detail}`}
    </FailureText>
  )
}

const hasStepDetails = (op: OperationSection["operations"][number]) =>
  op.type === AIOperationStatus.InvestigatingTable ||
  op.type === AIOperationStatus.UsingAgentTools ||
  op.type === AIOperationStatus.InvestigatingDocs ||
  op.type === AIOperationStatus.Processing ||
  op.type === AIOperationStatus.RunningQuery ||
  op.type === AIOperationStatus.ValidatingQuery

// The section clips its content for the expand animation; the padding keeps
// the copy button, taller than a line of query, inside it.
const QueryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  padding: 0.6rem 2.8rem;
`

// Copies one query; shown while the pointer is on it or it has focus.
// Centred on the query's first line.
const QueryCopy = styled(CopyButton)`
  position: absolute;
  top: calc(0.96rem - 1.4rem);
  right: 0;
  opacity: 0;
  transition: opacity 120ms ease-out;

  @media (hover: none) {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const QueryStep = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;

  ${FailureText} {
    padding-left: 0;
  }

  &:hover ${QueryCopy}, &:focus-within ${QueryCopy} {
    opacity: 1;
  }
`

// The queries the assistant runs or validates, in the editor's font. The
// right padding keeps long lines clear of the copy button.
const QueryText = styled.div`
  padding-right: 3.2rem;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.2rem;
  line-height: 1.6;
  color: ${color("contentSecondary")};
  white-space: pre-wrap;
  word-break: break-word;
`

// One of the agent's own tool calls: the command or what it did, and, once
// opened, the files it changed and what it printed.
const AgentToolStep = ({
  op,
}: {
  op: OperationSection["operations"][number]
}) => {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const args = op.args
  const hasDetails = !!args?.output || (args?.diffs?.length ?? 0) > 0
  const toggle = hasDetails ? () => setOpen((value) => !value) : undefined
  const icon = (
    <ReasoningIcon>
      <AgentToolIcon
        kind={args?.toolKind}
        color={theme.color.contentSecondary}
      />
    </ReasoningIcon>
  )
  const chevron = hasDetails && (
    <ToolStepChevron $expanded={open} aria-hidden="true">
      <ChevronRight size={14} />
    </ToolStepChevron>
  )
  const row =
    args?.toolKind === "execute" ? (
      <CommandItem>
        {icon}
        <CommandText tabIndex={0} data-hook="assistant-mode-command">
          {args.name}
        </CommandText>
        {chevron}
      </CommandItem>
    ) : (
      <ReasoningItem>
        {icon}
        <ReasoningText>
          <ReasoningTextPart>{args?.name}</ReasoningTextPart>
        </ReasoningText>
        {chevron}
      </ReasoningItem>
    )
  if (!toggle) return row
  return (
    <ToolStep>
      <ToolStepToggle
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} what ${args?.name ?? "the tool"} did`}
        data-hook="agent-tool-toggle"
        onClick={toggle}
        onKeyDown={(event: React.KeyboardEvent) => {
          if (event.target !== event.currentTarget) return
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            toggle()
          }
        }}
      >
        {row}
      </ToolStepToggle>
      {open && <AgentToolDetails output={args?.output} diffs={args?.diffs} />}
    </ToolStep>
  )
}

type OperationStepProps = {
  op: OperationSection["operations"][number]
  opKey: string
}

const OperationStep = ({ op, opKey }: OperationStepProps) => {
  const theme = useTheme()

  if (op.type === AIOperationStatus.Processing) {
    const stepMessage = formatDetailedStatusMessage(op.type, op.args)
    return (
      <ReasoningItem key={opKey}>
        <ReasoningIcon>
          <BrainIcon style={{ width: "14px", height: "14px" }} />
        </ReasoningIcon>
        <ReasoningText>
          <ReasoningTextPart>{stepMessage}</ReasoningTextPart>
        </ReasoningText>
      </ReasoningItem>
    )
  }

  if (op.type === AIOperationStatus.InvestigatingTable) {
    // Announced before its arguments, the step has no table yet.
    if (!op.args?.name) return null
    const tableName = op.args.name
    const type =
      op.args && "tableOpType" in op.args ? op.args.tableOpType : "details"
    return (
      <ReasoningItem key={opKey}>
        <ReasoningIcon>
          <Table size={14} color={theme.color.contentSecondary} />
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

  if (op.type === AIOperationStatus.UsingAgentTools) {
    return <AgentToolStep key={opKey} op={op} />
  }

  if (op.type === AIOperationStatus.InvestigatingDocs) {
    const items =
      op.args && "items" in op.args && Array.isArray(op.args.items)
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
                  <FileTextIcon
                    size={14}
                    color={theme.color.contentSecondary}
                  />
                </ReasoningIcon>
                <ReasoningText>
                  {item.section ? (
                    <>
                      <ReasoningTextPart>Investigating</ReasoningTextPart>
                      <CodeBadge>
                        <CodeBadgeText>{item.section}</CodeBadgeText>
                      </CodeBadge>
                      <ReasoningTextPart>in</ReasoningTextPart>
                      <CodeBadge>
                        <CodeBadgeText>{item.name}</CodeBadgeText>
                      </CodeBadge>
                    </>
                  ) : (
                    <>
                      <ReasoningTextPart>Investigating</ReasoningTextPart>
                      <CodeBadge>
                        <CodeBadgeText>{item.name}</CodeBadgeText>
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

    const name = op.args && "name" in op.args ? op.args.name : null
    const docSection = op.args && "section" in op.args ? op.args.section : null
    return (
      <ReasoningItem key={opKey}>
        <ReasoningIcon>
          <FileTextIcon size={14} />
        </ReasoningIcon>
        <ReasoningText>
          {name && docSection ? (
            <>
              <ReasoningTextPart>Investigating</ReasoningTextPart>
              <CodeBadge>
                <CodeBadgeText>{docSection}</CodeBadgeText>
              </CodeBadge>
              <ReasoningTextPart>in</ReasoningTextPart>
              <CodeBadge>
                <CodeBadgeText>{name}</CodeBadgeText>
              </CodeBadge>
              <ReasoningTextPart>documentation</ReasoningTextPart>
            </>
          ) : name ? (
            <>
              <ReasoningTextPart>Investigating</ReasoningTextPart>
              <CodeBadge>
                <CodeBadgeText>{name}</CodeBadgeText>
              </CodeBadge>
              <ReasoningTextPart>documentation</ReasoningTextPart>
            </>
          ) : (
            <ReasoningTextPart>Investigating documentation</ReasoningTextPart>
          )}
        </ReasoningText>
      </ReasoningItem>
    )
  }

  return null
}

type AssistantModesCompactProps = {
  operationHistory: OperationHistory
  status?: AIOperationStatus | null
  isLive?: boolean
  onScrollNeeded?: () => void
  collapsed?: boolean
  endTimestamp?: number
}

export const AssistantModesCompact: React.FC<AssistantModesCompactProps> = ({
  operationHistory,
  status,
  isLive = false,
  onScrollNeeded,
  collapsed = false,
  endTimestamp,
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
        // The plan stays open while the agent works through it.
        if (
          index < operationSections.length - 1 &&
          section.type !== AIOperationStatus.Planning
        ) {
          newCollapsed[section.id] = true
        }
      })
      setCollapsedSections(newCollapsed)
      onScrollNeeded?.()
    }
    prevSectionCountRef.current = operationSections.length
    prevIsLiveRef.current = isLive
  }, [operationSections, isLive, onScrollNeeded])

  // A live step can grow without a new one, like a query that arrives after
  // its step was announced; the chat follows it as it does new steps.
  useEffect(() => {
    if (isLive) onScrollNeeded?.()
  }, [operationHistory, isLive, onScrollNeeded])

  const handleToggleSection = (sectionId: string) => {
    setCollapsedSections((prev) => {
      const section = operationSections.find((s) => s.id === sectionId)
      const isExpandable = section ? getIsExpandableSection(section) : false
      const sectionIndex = operationSections.findIndex(
        (s) => s.id === sectionId,
      )
      const isLastSection = sectionIndex === operationSections.length - 1
      const defaultExpanded = collapsed
        ? false
        : isLive
          ? isLastSection || section?.type === AIOperationStatus.Planning
          : true

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
    const lastTimestamp =
      endTimestamp ?? operationHistory[operationHistory.length - 1]?.timestamp
    if (!firstTimestamp || !lastTimestamp || firstTimestamp === lastTimestamp)
      return null
    return formatDurationMs(lastTimestamp - firstTimestamp)
  }, [operationHistory, endTimestamp])

  if (operationHistory.length === 0) {
    return null
  }

  const sectionsContent = operationSections.map((section, index) => {
    const isExpandable = getIsExpandableSection(section)
    const isLastSection = index === operationSections.length - 1
    const defaultExpanded = collapsed
      ? false
      : isLive
        ? isLastSection || section.type === AIOperationStatus.Planning
        : true
    const isExpanded =
      collapsedSections[section.id] === undefined
        ? defaultExpanded && isExpandable
        : !collapsedSections[section.id] && isExpandable
    const nextSection: OperationSection | undefined =
      operationSections[index + 1]
    const sectionDuration = getSectionDuration(
      section,
      nextSection,
      !nextSection ? endTimestamp : undefined,
    )
    const isQuerySection =
      section.type === AIOperationStatus.RunningQuery ||
      section.type === AIOperationStatus.ValidatingQuery
    const plan =
      section.type === AIOperationStatus.Planning
        ? (section.operations[section.operations.length - 1]?.args?.plan ?? [])
        : null
    // A plan is done once every item is: until then it spins while the
    // agent works, and shows open if the answer ended before it.
    const planState: "done" | "running" | "open" | null = !plan
      ? null
      : plan.every((entry) => entry.status === "completed")
        ? "done"
        : isLive
          ? "running"
          : "open"
    const isContentSection =
      section.type === AIOperationStatus.Thinking || isQuerySection || !!plan
    const sectionContentText =
      section.type === AIOperationStatus.Thinking
        ? (section.operations[0]?.content ?? "")
        : ""

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
          role={isExpandable ? "button" : "presentation"}
          tabIndex={isExpandable ? 0 : undefined}
          aria-expanded={isExpandable ? isExpanded : undefined}
          onClick={
            isExpandable ? () => handleToggleSection(section.id) : undefined
          }
          onKeyDown={
            isExpandable
              ? (e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    handleToggleSection(section.id)
                  }
                }
              : undefined
          }
        >
          <ReasoningIcon
            data-state={
              section.active || planState === "running"
                ? "running"
                : section.abort || section.failed
                  ? "failed"
                  : planState === "open"
                    ? "open"
                    : "done"
            }
          >
            {section.active || planState === "running" ? (
              <CircleNotchSpinner size={14} />
            ) : section.abort || section.failed ? (
              <FailedIcon />
            ) : planState === "open" ? (
              <CircleDashedIcon size={16} color={theme.color.contentMuted} />
            ) : (
              <CheckIcon />
            )}
          </ReasoningIcon>
          {/* Title, time and count share a baseline: they are set in
              different fonts. */}
          <Box gap="0.3rem" align="baseline">
            <ModeTitle $isActive={section.active}>{section.type}</ModeTitle>
            {sectionDuration && (
              <DurationText>({sectionDuration})</DurationText>
            )}
            {plan && plan.length > 0 && (
              <DurationText data-hook="assistant-mode-plan-progress">
                {plan.filter((entry) => entry.status === "completed").length}/
                {plan.length}
              </DurationText>
            )}
            {isExpandable && (
              <ModeChevron $expanded={isExpanded}>
                <ChevronRight size={14} />
              </ModeChevron>
            )}
          </Box>
        </ModeHeaderTop>
        {isExpandable && isContentSection && (
          <ExpandableWrapper $expanded={isExpanded} inert={!isExpanded}>
            <ExpandableContent>
              {isQuerySection ? (
                <QueryList>
                  {section.operations.map((op, idx) => {
                    const queryKey = `${section.id}-${idx}-query`
                    return (
                      <QueryStep key={queryKey}>
                        {op.content ? (
                          <>
                            <QueryText data-hook="assistant-mode-query">
                              {op.content}
                            </QueryText>
                            <QueryCopy
                              text={op.content}
                              iconOnly
                              size="sm"
                              variant="ghost"
                              copiedMode="replace"
                              aria-label="Copy query"
                              title="Copy query"
                              data-hook="assistant-mode-query-copy"
                            />
                          </>
                        ) : null}
                        {op.args?.failed !== undefined && (
                          <StepFailure op={op} />
                        )}
                      </QueryStep>
                    )
                  })}
                </QueryList>
              ) : plan ? (
                <PlanList entries={plan} />
              ) : sectionContentText ? (
                <ThinkingContent>{sectionContentText}</ThinkingContent>
              ) : null}
            </ExpandableContent>
          </ExpandableWrapper>
        )}
        {isExpandable && !isContentSection && (
          <ExpandableWrapper $expanded={isExpanded} inert={!isExpanded}>
            <ExpandableContent>
              <ReasoningThread>
                {section.operations.map((op, idx) => {
                  // An agent's tool call keeps its key while its output
                  // streams in, so an opened step stays open.
                  const opKey = `${section.id}-${idx}-${op.args?.callId ?? JSON.stringify(op.args)}`
                  return (
                    <React.Fragment key={opKey}>
                      <OperationStep op={op} opKey={opKey} />
                      {op.args?.failed !== undefined && <StepFailure op={op} />}
                    </React.Fragment>
                  )
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
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                setCollapsedProcessingExpanded((prev) => !prev)
              }
            }}
            data-hook="assistant-mode-processing-collapsed"
            role="button"
            tabIndex={0}
            aria-expanded={collapsedProcessingExpanded}
          >
            <CheckIcon />
            <ModeTitle $isActive={false}>
              {durationText ? `Worked for ${durationText}` : "Worked"}
            </ModeTitle>
            <ModeChevron $expanded={collapsedProcessingExpanded}>
              <ChevronRight size={14} />
            </ModeChevron>
          </ModeHeaderTop>
          <ExpandableWrapper
            $expanded={collapsedProcessingExpanded}
            inert={!collapsedProcessingExpanded}
          >
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
