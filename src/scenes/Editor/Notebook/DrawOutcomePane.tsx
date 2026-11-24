import React from "react"
import styled from "styled-components"
import { CircleNotchSpinner } from "../Monaco/icons"
import { PaneEmptyState } from "./PaneEmptyState"
import type { DrawOutcome } from "./drawOutcome"

// Announces loading/empty transitions. Stays mounted with only its text
// changing — inserting an already-populated live region announces
// inconsistently across screen readers.
export const VisuallyHiddenStatus = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`

const OutcomeState = styled(PaneEmptyState)`
  height: 100%;
  padding: 0 1.6rem;
  text-align: center;
`

/**
 * The pane of a draw that shows no drawing: a spinner while waiting, an alert
 * for a blocked or failed draw, the reason for an empty or refused one.
 * `announced`: a live region of the canvas already reads the message, so the
 * pane only shows it. A cancelled draw has its own pane, with Retry.
 */
export const DrawOutcomePane = ({
  outcome,
  announced = false,
}: {
  outcome: DrawOutcome
  announced?: boolean
}) => {
  const { status, message } = outcome
  if (status === "waiting")
    return (
      <OutcomeState
        aria-hidden={announced || undefined}
        data-hook="draw-waiting"
      >
        <CircleNotchSpinner size={24} />
        {!announced && (
          <VisuallyHiddenStatus role="status">{message}</VisuallyHiddenStatus>
        )}
      </OutcomeState>
    )
  if (status === "blocked" || status === "failed")
    return (
      <OutcomeState role="alert" data-hook="draw-alert">
        {message}
      </OutcomeState>
    )
  return (
    <OutcomeState aria-hidden={announced || undefined} data-hook="draw-message">
      {message}
    </OutcomeState>
  )
}
