import React from "react"
import styled, { useTheme } from "styled-components"
import { Tooltip } from "../../../../components/Tooltip"
import { formatTokenCount } from "../../../../utils/ai/tokenCount"
import type { ContextUsage as Usage } from "../../../../utils/ai/aiAssistant"

// Past this share of the context, the ring shows a warning: the model will
// soon compact or drop the earliest turns.
export const CONTEXT_WARNING_SHARE = 0.8

const SIZE = 16
const STROKE = 2
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const Root = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.8rem;
  height: 2.8rem;
  margin-right: 0.8rem;
  border-radius: 0.4rem;
  cursor: default;

  &:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.statusInfo};
  }
`

// How full an agent's context is, as a ring: grey, then the warning color
// once it is nearly full, when the agent will soon compact it. The tooltip
// has the numbers.
export const ContextUsage = ({ usage }: { usage: Usage }) => {
  const theme = useTheme()
  const share = Math.min(1, Math.max(0, usage.used / usage.size))
  const nearlyFull = share >= CONTEXT_WARNING_SHARE
  const percent = Math.round(share * 100)
  const summary = `Context: ${formatTokenCount(usage.used)} of ${formatTokenCount(usage.size)} tokens (${percent}%)`
  return (
    <Tooltip
      placement="top"
      content={
        nearlyFull
          ? `${summary}. The agent will soon compact the conversation.`
          : summary
      }
    >
      <Root
        tabIndex={0}
        role="img"
        aria-label={summary}
        data-hook="chat-context-usage"
        data-level={nearlyFull ? "high" : "normal"}
      >
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          aria-hidden="true"
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={theme.color.borderDefault}
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={
              nearlyFull
                ? theme.color.statusWarning
                : theme.color.contentSecondary
            }
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - share)}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </svg>
      </Root>
    </Tooltip>
  )
}
