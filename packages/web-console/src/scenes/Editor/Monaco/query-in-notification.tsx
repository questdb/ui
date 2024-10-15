import React from "react"
import styled from "styled-components"
import { Text } from "../../../components"
import { Box } from "@questdb/react-components"
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
      <StyledText color="foreground" title={query}>
        {query}
      </StyledText>
      <CopyButton text={query} iconOnly={true} />
    </Box>
  )
}
