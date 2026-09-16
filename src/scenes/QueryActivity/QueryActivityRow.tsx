import React, { useMemo, useState } from "react"
import styled, { css } from "styled-components"
import {
  ClockIcon,
  CopyIcon,
  CheckIcon,
  HourglassIcon,
  MemoryIcon,
  UserIcon,
  WrenchIcon,
  XIcon,
} from "@phosphor-icons/react"
import {
  Box,
  Button,
  CopyButton,
  Tooltip,
  TruncatedText,
} from "../../components"
import { Stop } from "../../components/icons"
import { LiteEditor } from "../../components/LiteEditor"
import { BUTTON_HEIGHTS } from "../../components/Button"
import {
  formatBytes,
  formatCompactElapsedDuration,
  formatElapsedDuration,
} from "../../utils/format"
import { TimestampUnderline } from "../Schema/TableDetailsDrawer/shared-styles"
import {
  describeQueryStatus,
  FINISHED_FADE_MS,
  type QueryActivityItem,
  type QueryPhase,
  type Severity,
} from "./queryActivity"
import { buildQueryPreview, formatQuery } from "./queryPreview"
import { QUERY_ACTIVITY_THRESHOLDS } from "./thresholds"

type Props = {
  item: QueryActivityItem
  onOpenInEditor: () => void
  onCancel: () => void
  onHoldChange: (held: boolean) => void
  onFadeEnd: () => void
}

const FINISHED_STATUS =
  "The query left the registry. It finished, failed, or timed out."

const PHASE_LABELS: Record<QueryPhase, string> = {
  running: "Running",
  cancelled: "Cancelled",
  finished: "Finished",
}

const PHASE_ICONS: Record<QueryPhase, React.ReactNode> = {
  running: <HourglassIcon size={16} />,
  cancelled: <XIcon size={16} />,
  finished: <CheckIcon size={16} />,
}

const severityColor = css<{ $severity: Severity }>`
  color: ${({ theme, $severity }) =>
    $severity === "critical"
      ? theme.color.statusDanger
      : $severity === "warning"
        ? theme.color.statusWarning
        : theme.color.contentPrimary};
`

const Row = styled.div<{ $fading: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  width: 100%;
  padding: 2rem 1.5rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.interactionNeutral};
  opacity: ${({ $fading }) => ($fading ? 0 : 1)};
  transition: opacity ${FINISHED_FADE_MS}ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  &:hover {
    background: ${({ theme }) => theme.color.surfaceRaised};
  }
`

const HeadLine = styled(Box).attrs({
  align: "center",
  gap: "1.6rem",
})`
  width: 100%;
  height: ${BUTTON_HEIGHTS.sm};
`

const StatusIcon = styled.span`
  display: inline-flex;
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const StateLabel = styled.span`
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: ${({ theme }) => theme.fontSize.md};
  line-height: 1;
  white-space: nowrap;
`

const Identity = styled(Box).attrs({
  align: "center",
  gap: "0.5rem",
})`
  flex-shrink: 0;
`

const QueryId = styled(TruncatedText)`
  flex: 0 1 auto;
  text-align: right;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: ${({ theme }) => theme.fontSize.md};
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
`

const Elapsed = styled(Button).attrs({ variant: "ghost", size: "sm" })`
  && {
    height: auto;
    padding: 0.2rem 0;
    color: ${({ theme }) => theme.color.contentPrimary};
    font-size: ${({ theme }) => theme.fontSize.md};
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }
  margin-left: auto;
  flex-shrink: 0;
  white-space: nowrap;
`

const ElapsedUnderline = styled(TimestampUnderline)`
  color: inherit;
  font-weight: inherit;
  text-decoration-thickness: 1px;
`

const Memory = styled(Box).attrs({
  align: "center",
  gap: "0.5rem",
})<{ $severity: Severity }>`
  ${severityColor}
  font-size: ${({ theme }) => theme.fontSize.md};
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;

  svg {
    flex-shrink: 0;
  }
`

const MemoryUnavailable = styled(Box).attrs({
  align: "center",
  gap: "0.5rem",
})`
  color: ${({ theme }) => theme.color.contentMuted};
  font-size: ${({ theme }) => theme.fontSize.md};
  line-height: 1;
  white-space: nowrap;

  svg {
    flex-shrink: 0;
  }
`

const Tag = styled.span`
  padding: 0.2rem 0.5rem;
  border-radius: 0.2rem;
  background: ${({ theme }) => theme.color.interactionNeutral};
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: ${({ theme }) => theme.fontSize.ms};
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
`

const Actions = styled(Box).attrs({
  align: "center",
  gap: "0.5rem",
  justifyContent: "flex-end",
})`
  min-width: 0;
  flex: 0 1 auto;
`

const CancelButton = styled(Button).attrs({
  variant: "dangerGhost",
  size: "sm",
})`
  padding: 0 0.6rem;
  flex-shrink: 0;
`

const SqlBlock = styled.div`
  width: 100%;
`

const QueryCopyButton = styled(CopyButton)`
  height: 2.8rem;
  padding: 0.5rem;
  gap: 1rem;
  font-size: 1.2rem;

  > svg {
    color: ${({ theme }) => theme.color.contentSecondary};
  }
`

const MetaLine = styled(Box).attrs({
  align: "center",
  gap: "1.6rem",
})`
  min-width: 0;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: ${({ theme }) => theme.fontSize.sm};
`

const MetaGroup = styled(Box).attrs({
  align: "center",
  gap: "1.6rem",
})`
  min-width: 0;
  flex: 1 1 auto;
`

const MetaItem = styled(Box).attrs({
  align: "center",
  gap: "0.5rem",
})`
  min-width: 0;
  flex: 0 1 auto;
  white-space: nowrap;

  svg {
    flex-shrink: 0;
  }
`

export const QueryActivityRow = ({
  item,
  onOpenInEditor,
  onCancel,
  onHoldChange,
  onFadeEnd,
}: Props) => {
  const { row, phase, elapsedMs, severity, fading } = item
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const canCancel = phase === "running" && !row.isWal
  const workerLabel = row.workerPool
    ? `${row.workerPool} #${row.workerId}`
    : `worker #${row.workerId}`
  const startedAt = new Date(row.queryStart).toISOString()
  const formattedQuery = useMemo(() => formatQuery(row.query), [row.query])
  const status =
    phase === "finished"
      ? FINISHED_STATUS
      : describeQueryStatus(row, severity, QUERY_ACTIVITY_THRESHOLDS)

  const updateHold = (nextHovered: boolean, nextFocused: boolean) => {
    setHovered(nextHovered)
    setFocused(nextFocused)
    onHoldChange(nextHovered || nextFocused)
  }
  const indicator = (
    <StatusIcon data-hook="query-activity-row-status">
      {PHASE_ICONS[phase]}
    </StatusIcon>
  )
  const preview = buildQueryPreview(formattedQuery)

  return (
    <Row
      $fading={fading}
      data-hook="query-activity-row"
      data-query-id={row.queryId.toString()}
      data-severity={severity}
      data-state={phase}
      onTransitionEnd={(event) => {
        if (fading && event.propertyName === "opacity") onFadeEnd()
      }}
      onMouseEnter={() => updateHold(true, focused)}
      onMouseLeave={() => updateHold(false, focused)}
      onFocus={() => updateHold(hovered, true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          updateHold(hovered, false)
        }
      }}
    >
      <HeadLine>
        <Identity>
          {status === null ? (
            indicator
          ) : (
            <Tooltip content={status} placement="bottom">
              {indicator}
            </Tooltip>
          )}
          <StateLabel data-hook="query-activity-row-state">
            {PHASE_LABELS[phase]}
          </StateLabel>
        </Identity>
        {row.memoryUsed === null ? (
          <MemoryUnavailable>
            <MemoryIcon size={16} />
            N/A
          </MemoryUnavailable>
        ) : (
          <Memory $severity={severity} data-hook="query-activity-row-memory">
            <MemoryIcon size={16} />
            {formatBytes(row.memoryUsed)}
            {row.memoryLimit !== null &&
              ` / ${formatBytes(row.memoryLimit)} used`}
          </Memory>
        )}

        <Tooltip
          content={
            <Box gap="1rem" align="center">
              <span style={{ whiteSpace: "nowrap" }}>
                Started at: {startedAt}
              </span>
              <CopyButton text={startedAt} iconOnly size="sm" />
            </Box>
          }
          placement="bottom"
        >
          <Elapsed
            data-hook="query-activity-row-duration"
            aria-label={`Elapsed: ${formatElapsedDuration(elapsedMs)}. Show start time`}
          >
            <ClockIcon size={16} />
            <ElapsedUnderline>
              {formatCompactElapsedDuration(elapsedMs)}
            </ElapsedUnderline>
          </Elapsed>
        </Tooltip>
      </HeadLine>

      <SqlBlock data-hook="query-activity-row-query">
        <LiteEditor
          value={preview.text}
          compactToolbar
          toolbarActions={
            <QueryCopyButton
              size="sm"
              variant="ghost"
              aria-label="Copy query text"
              iconOnly
              icon={<CopyIcon size="16px" />}
              text={formattedQuery}
              title={undefined}
              data-hook="query-activity-row-copy"
            />
          }
          grayedOutLines={preview.grayedOutLines}
          onOpenInEditor={onOpenInEditor}
        />
      </SqlBlock>

      <MetaLine data-hook="query-activity-row-meta">
        <MetaGroup>
          <MetaItem>
            <UserIcon size={16} />
            <TruncatedText>{row.username ?? "unknown"}</TruncatedText>
          </MetaItem>
          <MetaItem>
            <WrenchIcon size={16} />
            <TruncatedText>{workerLabel}</TruncatedText>
          </MetaItem>
          {row.isWal && <Tag data-hook="query-activity-row-wal">WAL</Tag>}
        </MetaGroup>
        <Actions>
          <QueryId data-hook="query-activity-row-id">
            {`#${row.queryId}`}
          </QueryId>
          {canCancel && (
            <Tooltip content="Cancel query" placement="bottom">
              <CancelButton
                aria-label="Cancel query"
                onClick={onCancel}
                data-hook="query-activity-row-cancel"
              >
                <Stop size="14px" />
              </CancelButton>
            </Tooltip>
          )}
        </Actions>
      </MetaLine>
    </Row>
  )
}
