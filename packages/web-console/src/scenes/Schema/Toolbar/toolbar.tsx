import React from "react"
import styled from "styled-components"
import { Box, Input } from "@questdb/react-components"
import { Filter3 } from "@styled-icons/remix-line"
import { ErrorWarning } from "@styled-icons/remix-fill"
import { IconWithTooltip } from "../../../components"

const Root = styled(Box).attrs({
  justifyContent: "space-between",
  gap: "1rem",
  alignItems: "center",
})`
  width: 100%;
  padding: 0 2rem;
  margin-bottom: 1rem;
`

const Filter = styled.div`
  position: relative;
  display: flex;
  width: 100%;
`

const FilterIcon = styled(Filter3)`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  left: 1rem;
`

const StyledInput = styled(Input)`
  padding-left: 3.5rem;

  &::placeholder {
    color: ${({ theme }) => theme.color.foreground};
  }
`

const Error = styled(Box).attrs({ gap: "0.5rem" })<{
  suspendedTablesCount: number
}>`
  color: ${({ theme, suspendedTablesCount }) =>
    theme.color[`${suspendedTablesCount > 0 ? "red" : "gray1"}`]};
`

export const Toolbar = ({
  suspendedTablesCount,
  setQuery: setFilter,
}: {
  suspendedTablesCount: number
  setQuery: (filter: string) => void
}) => {
  return (
    <Root>
      <Filter>
        <FilterIcon size="20px" />
        <StyledInput
          name="table_filter"
          placeholder="Filter..."
          onChange={(e) => setFilter(e.target.value)}
        />
      </Filter>
      <Error suspendedTablesCount={suspendedTablesCount}>
        <IconWithTooltip
          icon={<ErrorWarning size="18px" />}
          tooltip={
            suspendedTablesCount > 0
              ? "Show suspended tables"
              : "No suspended tables"
          }
          placement="bottom"
        />
        {suspendedTablesCount > 0 && <span>{suspendedTablesCount}</span>}
      </Error>
    </Root>
  )
}
