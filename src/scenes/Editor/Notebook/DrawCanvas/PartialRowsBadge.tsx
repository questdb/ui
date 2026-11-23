import React from "react"
import styled from "styled-components"
import { WarningIcon } from "@phosphor-icons/react"
import { ButtonBase, Tooltip } from "../../../../components"
import { useToggletip } from "../../../../components/Tooltip/useToggletip"
import type { CellResult } from "../../../../store/notebook"

// Sits in the chart's top-right padding: presets keep 40px above the plot,
// fitted charts 16px around it, so the 16px badge covers no axis, legend or
// mark. The order book makes room in its own header.
const Badge = styled(ButtonBase)`
  position: absolute;
  top: 0;
  right: 0.4rem;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  padding: 0;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: ${({ theme }) => theme.color.statusWarning};

  &:hover {
    background: ${({ theme }) => theme.color.interactionHover};
  }
`

const Lines = styled.span`
  display: grid;
  gap: 0.4rem;
  font-size: 1.2rem;
  line-height: 1.45;

  strong {
    color: ${({ theme }) => theme.color.contentPrimary};
    font-weight: 600;
  }
`

const count = (n: number) => n.toLocaleString("en-US")

/** Statements whose rows were capped, as "first N of M rows" lines. */
export const partialRowsLines = (
  result: CellResult | null | undefined,
): string[] => {
  const results = result?.results ?? []
  const capped = results.flatMap((r, i) =>
    r.type === "dql" && r.count > r.dataset.length
      ? [{ i, shown: r.dataset.length, total: r.count }]
      : [],
  )
  return capped.map(({ i, shown, total }) =>
    results.length > 1
      ? `Statement ${i + 1}: first ${count(shown)} of ${count(total)} rows.`
      : `First ${count(shown)} of ${count(total)} rows.`,
  )
}

export const PartialRowsBadge = ({ lines }: { lines: string[] }) => {
  const { tooltipProps, triggerProps } = useToggletip()
  return (
    <Tooltip
      {...tooltipProps}
      placement="bottom-end"
      maxWidth="30rem"
      content={
        <Lines>
          <strong>Drawn from part of the result</strong>
          {lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
          <span>Aggregate or narrow the query to draw every row.</span>
        </Lines>
      }
    >
      <Badge
        aria-label={`Drawn from part of the result. ${lines.join(" ")}`}
        data-hook="draw-partial-rows"
        {...triggerProps}
      >
        <WarningIcon size={14} aria-hidden />
      </Badge>
    </Tooltip>
  )
}
