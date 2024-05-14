import React from "react"
import styled from "styled-components"
import { Button, Box, Input } from "@questdb/react-components"
import { Filter3 } from "@styled-icons/remix-line"
import { ErrorWarning } from "@styled-icons/remix-fill"
import { PopperHover, Tooltip } from "../../../components"

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

const StyledButton = styled(Button)`
  &:disabled {
    border: none;
  }
`

const Error = styled(Box).attrs({ gap: "0.5rem" })<{
  suspendedTablesCount: number
}>`
  &,
  button {
    color: ${({ theme, suspendedTablesCount }) =>
      theme.color[`${suspendedTablesCount > 0 ? "red" : "gray1"}`]};
    cursor: ${({ suspendedTablesCount }) =>
      suspendedTablesCount > 0 ? "pointer" : "default"};
  }
`

export const Toolbar = ({
  suspendedTablesCount,
  setQuery: setFilter,
  filterSuspendedOnly,
  setFilterSuspendedOnly,
}: {
  suspendedTablesCount: number
  setQuery: (filter: string) => void
  filterSuspendedOnly: boolean
  setFilterSuspendedOnly: (filter: boolean) => void
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
        <PopperHover
          placement="bottom"
          trigger={
            <StyledButton
              disabled={suspendedTablesCount === 0}
              skin="transparent"
              onClick={() => setFilterSuspendedOnly(!filterSuspendedOnly)}
              prefixIcon={<ErrorWarning size="18px" />}
            >
              {suspendedTablesCount > 0 && <span>{suspendedTablesCount}</span>}
            </StyledButton>
          }
        >
          <Tooltip>
            {suspendedTablesCount > 0
              ? `${filterSuspendedOnly ? "Hide" : "Show"} suspended tables`
              : "No suspended tables"}
          </Tooltip>
        </PopperHover>
      </Error>
    </Root>
  )
}
