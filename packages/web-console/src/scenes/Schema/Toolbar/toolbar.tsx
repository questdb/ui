import React from "react"
import styled from "styled-components"
import { Box, Input } from "@questdb/react-components"
import { Filter3 } from "@styled-icons/remix-line"

const Root = styled(Box).attrs({
  justifyContent: "space-between",
  gap: "1rem",
  alignItems: "center",
})`
  width: 100%;
  padding: 0 2rem;
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

export const Toolbar = ({
  setFilter,
}: {
  setFilter: (filter: string) => void
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
    </Root>
  )
}
