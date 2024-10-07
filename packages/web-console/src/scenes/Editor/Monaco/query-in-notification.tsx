import React from "react"
import styled from "styled-components"
import { Text } from "../../../components"
import { Box } from "@questdb/react-components"
import { CopyButton } from "../../../components/CopyButton"

const StyledText = styled(Text)`
  white-space: nowrap;
`

export const QueryInNotification = ({ query }: { query: string }) => {
  if (!query) return null

  return (
    <Box gap="1rem" align="center">
      <StyledText color="foreground" title={query}>
        {query.length > 50 ? `${query.slice(0, 50)}...` : query}
      </StyledText>
      <CopyButton text={query} iconOnly={true} />
    </Box>
  )
}
