import React from "react"
import styled from "styled-components"
import { Box, Text } from "../../../components"
import { CopyButton } from "../../../components/CopyButton"

const StyledText = styled(Text)`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

export const QueryInNotification = ({ query }: { query: string }) => {
  if (!query) return null

  return (
    <Box gap="1rem" align="center">
      <CopyButton text={query} iconOnly />
      <StyledText color="foreground" title={query}>
        {query}
      </StyledText>
    </Box>
  )
}
