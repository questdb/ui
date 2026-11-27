import React from "react"
import styled from "styled-components"
import { GaugeIcon } from "@phosphor-icons/react"
import { Tooltip } from "../../../../components/Tooltip"
import { formatTokenCount } from "../../../../utils/ai/tokenCount"

export type TokenUsageCounts = { inputTokens: number; outputTokens: number }

const Root = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
  height: 2.8rem;
  padding: 0 0.4rem;
  margin-right: 0.8rem;
  font-size: 1.2rem;
  line-height: 1.6rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  cursor: default;

  svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.contentMuted};
  }
`

// The input and output tokens the chat's answers spent, on the user's own
// API key.
export const TokenUsage = ({ usage }: { usage: TokenUsageCounts }) => {
  const input = formatTokenCount(usage.inputTokens)
  const output = formatTokenCount(usage.outputTokens)
  return (
    <Tooltip content="Input/output tokens spent" placement="top">
      <Root
        tabIndex={0}
        aria-label={`${input} input and ${output} output tokens spent`}
        data-hook="chat-token-usage"
      >
        <GaugeIcon size={14} aria-hidden="true" />
        {input}/{output}
      </Root>
    </Tooltip>
  )
}
