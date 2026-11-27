import React, { useEffect, useState } from "react"
import styled, { css } from "styled-components"
import { Button, Tooltip } from "../../components"
import { BUTTON_HEIGHTS, type ButtonProps } from "../../components/Button"

export type ResultActionDensity = "full" | "compact" | "icon"

// Toolbar content widths in rem, allowing room for a seven-digit row count.
const MIN_TOOLBAR_WIDTH = {
  grid: { full: 82, compact: 68 },
  chart: { full: 52, compact: 48 },
}

export const resultActionDensity = (
  chart: boolean,
  toolbarWidth: number,
): ResultActionDensity => {
  const { full, compact } = MIN_TOOLBAR_WIDTH[chart ? "chart" : "grid"]
  if (toolbarWidth >= full) return "full"
  return toolbarWidth >= compact ? "compact" : "icon"
}

// Keep the same button across density changes so a resize keeps focus.
const ActionButton = styled(Button)<{ $iconOnly: boolean }>`
  flex-shrink: 0;
  white-space: nowrap;

  ${({ $iconOnly }) =>
    $iconOnly &&
    css`
      width: ${BUTTON_HEIGHTS.md};
      padding: 0;
    `}
`

export const NotebookActionIcon = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.color.statusInfo};

  button:disabled &,
  button[aria-disabled="true"] & {
    color: ${({ theme }) => theme.color.contentDisabled};
  }
`

type Props = Pick<ButtonProps, "className" | "disabled" | "onClick"> & {
  "data-hook": string
  density: ResultActionDensity
  label: string
  compactLabel?: string
  icon: React.ReactNode
  busy?: boolean
  description?: string
}

export const ResultToolbarAction = ({
  density,
  label,
  compactLabel = label,
  icon,
  busy,
  description,
  ...props
}: Props) => {
  const showTooltip =
    density === "icon" ||
    (density === "compact" && compactLabel !== label) ||
    !!description
  const [tooltipOpen, setTooltipOpen] = useState(false)
  // Keep the tooltip controlled across resizes and forget old hover state.
  useEffect(() => {
    if (!showTooltip) setTooltipOpen(false)
  }, [showTooltip])

  return (
    <Tooltip
      delay={350}
      content={description ? `${label}. ${description}` : label}
      open={showTooltip && tooltipOpen}
      onOpenChange={(open) => setTooltipOpen(showTooltip && open)}
    >
      <ActionButton
        {...props}
        $iconOnly={density === "icon"}
        variant="secondary"
        aria-label={label}
        // Keep focus on a button while its action is in progress.
        aria-disabled={busy || undefined}
        aria-busy={busy}
        leadingIcon={icon}
      >
        {density === "icon"
          ? null
          : density === "compact"
            ? compactLabel
            : label}
      </ActionButton>
    </Tooltip>
  )
}
