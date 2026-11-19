import React, { useEffect, useState } from "react"
import styled, { css } from "styled-components"
import { NotebookIcon } from "@phosphor-icons/react"
import { Button, Tooltip } from "../../components"
import { BUTTON_HEIGHTS } from "../../components/Button"
import {
  useNotebookTransfer,
  type NotebookTransferRequest,
} from "../../hooks/useNotebookTransfer"

const Group = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0 0.5rem;
  border-left: 1px solid ${({ theme }) => theme.color.borderSubtle};
  white-space: nowrap;
`

// One element for every density: the toolbar can cross a breakpoint while the
// result pane lays out, and swapping elements would drop focus and clicks.
const ActionButton = styled(Button)<{ $iconOnly: boolean }>`
  ${({ $iconOnly }) =>
    $iconOnly &&
    css`
      width: ${BUTTON_HEIGHTS.md};
      min-width: ${BUTTON_HEIGHTS.md};
      padding: 0;
      justify-content: center;
    `}
`

const NotebookGlyph = styled(NotebookIcon)`
  color: ${({ theme }) => theme.color.statusInfo};

  button:disabled &,
  button[aria-disabled="true"] & {
    color: ${({ theme }) => theme.color.contentDisabled};
  }
`

export type TransferActionDensity = "full" | "compact" | "icon"

// Result toolbar widths (rem, so they follow the font size) from which each
// label still fits beside the other toolbar controls without clipping them.
// Measured with the real styles and a seven-digit row count; below `compact`
// only the icon is shown.
const MIN_TOOLBAR_WIDTH = {
  grid: { full: 82, compact: 68 },
  chart: { full: 52, compact: 48 },
}

// Every width at which the density can change, ascending. The toolbar only
// needs to re-render when its width crosses one of these.
export const TRANSFER_ACTION_BREAKPOINTS = [
  ...new Set(
    Object.values(MIN_TOOLBAR_WIDTH).flatMap(({ full, compact }) => [
      full,
      compact,
    ]),
  ),
].sort((a, b) => a - b)

// `toolbarWidth` is in rem.
export const transferActionDensity = (
  chart: boolean,
  toolbarWidth: number,
): TransferActionDensity => {
  const { full, compact } = MIN_TOOLBAR_WIDTH[chart ? "chart" : "grid"]
  if (toolbarWidth >= full) return "full"
  return toolbarWidth >= compact ? "compact" : "icon"
}

export const NotebookTransferActions: React.FC<{
  request?: NotebookTransferRequest
  chart: boolean
  density: TransferActionDensity
  showMonitor: boolean
}> = ({ request, chart, density, showMonitor }) => {
  const { transfer, busy } = useNotebookTransfer()
  const label = showMonitor
    ? "Auto-refresh in a notebook"
    : chart
      ? "Save chart to notebook"
      : "Add query to notebook"
  const compactLabel = showMonitor
    ? "Auto-refresh"
    : chart
      ? "Save chart"
      : "Add query"
  // Always the notebook glyph: in icon-only density an arrow would be
  // indistinguishable from the adjacent "Re-run query" button.
  const icon = <NotebookGlyph size={18} />
  const iconOnly = density === "icon"
  // Always controlled: switching the Radix tooltip between controlled and
  // uncontrolled warns and leaves stale open state behind. The full label
  // needs no tooltip; the button element itself never changes.
  const [tooltipOpen, setTooltipOpen] = useState(false)
  // A full-density tooltip is forced closed, so Radix reports its open
  // requests but never the matching close. Never record an open state there,
  // and forget one from a narrower toolbar, so it can't reappear unhovered.
  useEffect(() => {
    if (density === "full") setTooltipOpen(false)
  }, [density])

  return (
    <Group>
      <Tooltip
        delay={350}
        placement="bottom"
        content={label}
        open={density !== "full" && tooltipOpen}
        onOpenChange={(open) => setTooltipOpen(density !== "full" && open)}
      >
        <ActionButton
          $iconOnly={iconOnly}
          variant="secondary"
          disabled={!request}
          // Busy is aria-disabled, not disabled: a native disabled control
          // drops the keyboard focus of the user who just pressed it.
          aria-disabled={busy || undefined}
          aria-busy={busy}
          aria-label={label}
          leadingIcon={icon}
          data-hook={
            showMonitor ? "result-auto-refresh-notebook" : "result-add-notebook"
          }
          onClick={() => {
            if (!request || busy) return
            void transfer({
              ...request,
              monitor: showMonitor,
              source: showMonitor ? "result_monitor" : request.source,
            })
          }}
        >
          {iconOnly ? null : density === "compact" ? compactLabel : label}
        </ActionButton>
      </Tooltip>
    </Group>
  )
}
