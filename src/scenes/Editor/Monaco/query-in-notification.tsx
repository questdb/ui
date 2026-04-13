import React from "react"
import styled from "styled-components"
import { Box, Text } from "../../../components"
import { CopyButton } from "../../../components/CopyButton"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"

const StyledText = styled(Text)`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

export const QueryInNotification = ({ query }: { query: string }) => {
  if (!query) return null

  return (
    <Box gap="1rem" align="center">
      <CopyButton
        text={query}
        iconOnly
        onCopy={() => void trackEvent(ConsoleEvent.QUERY_LOG_QUERY_COPY)}
      />
      <StyledText color="foreground" title={query}>
        {query}
      </StyledText>
    </Box>
  )
}
