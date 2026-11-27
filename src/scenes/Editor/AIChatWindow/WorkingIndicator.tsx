import React, { useEffect, useState } from "react"
import styled from "styled-components"
import { slideAnimation } from "../../../components/Animation"
import { CircleNotchSpinner } from "../Monaco/icons"

// How long a live answer may stay silent before the indicator shows.
export const WORKING_AFTER_MS = 1000

// Drawn like a running step, in the same place: the same icon box, gap and
// padding as a step's header.
const Root = styled.div`
  display: flex;
  align-self: flex-start;
  align-items: center;
  gap: 0.8rem;
  padding: 0.4rem;
`

const Icon = styled.span`
  width: 1.4rem;
  height: 1.4rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
`

const Label = styled.span`
  font-size: 1.4rem;
  font-weight: 500;
  color: ${({ theme }) => theme.color.contentSecondary};
  ${slideAnimation}
`

// True once `enabled` has held for `delayMs` with `activity` unchanged. New
// activity hides it at once, before the next paint, and restarts the wait.
export const useQuietFor = (
  activity: string,
  enabled: boolean,
  delayMs: number,
): boolean => {
  const [quietAt, setQuietAt] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    const timer = setTimeout(() => setQuietAt(activity), delayMs)
    return () => clearTimeout(timer)
  }, [activity, enabled, delayMs])
  return enabled && quietAt === activity
}

// Shown while an answer is still running but nothing shows that it is: no
// step is in progress and no text has arrived for a moment, as when an agent
// works silently after the user answered its question. It is not a step of
// its own and is never kept in the answer.
export const WorkingIndicator = () => (
  <Root role="status" aria-live="polite" data-hook="assistant-working">
    <Icon>
      <CircleNotchSpinner size={14} />
    </Icon>
    <Label>Working</Label>
  </Root>
)
