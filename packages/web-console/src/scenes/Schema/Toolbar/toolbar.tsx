import React, { useContext } from "react"
import styled from "styled-components"
import { Button, Box, Input } from "@questdb/react-components"
import { Close, Filter3 } from "@styled-icons/remix-line"
import { Error as ErrorIcon } from "@styled-icons/boxicons-regular"
import { PopperHover, Tooltip } from "../../../components"
import { SchemaContext } from "../SchemaContext"

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
  color: ${({ theme }) => theme.color.gray2};
`

const CloseIcon = styled(Close)`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  right: 0.5rem;
`

const StyledInput = styled(Input)`
  padding-left: 3.5rem;
  padding-right: 3.5rem;
  width: 100%;

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
  filterSuspendedOnly,
  setFilterSuspendedOnly,
}: {
  suspendedTablesCount: number
  filterSuspendedOnly: boolean
  setFilterSuspendedOnly: (filter: boolean) => void
}) => {
  const { setQuery } = useContext(SchemaContext)
  const queryRef = React.useRef<HTMLInputElement>(null)

  return (
    <Root>
      <Filter>
        <FilterIcon size="20px" />
        {queryRef.current?.value && (
          <CloseIcon
            size="20px"
            onClick={() => {
              setQuery("")
              queryRef.current?.value && (queryRef.current.value = "")
            }}
            data-hook="schema-search-clear-button"
          />
        )}
        <StyledInput
          ref={queryRef}
          name="table_filter"
          placeholder="Filter..."
          onChange={(e) => setQuery(e.target.value)}
        />
      </Filter>
      {suspendedTablesCount > 0 && (
        <Error suspendedTablesCount={suspendedTablesCount}>
          <PopperHover
            placement="bottom"
            trigger={
              <StyledButton
                skin="transparent"
                onClick={() => setFilterSuspendedOnly(!filterSuspendedOnly)}
                prefixIcon={<ErrorIcon size="18px" />}
                data-hook="schema-filter-suspended-button"
              >
                <span>{suspendedTablesCount}</span>
              </StyledButton>
            }
          >
            <Tooltip>Show suspended tables</Tooltip>
          </PopperHover>
        </Error>
      )}
    </Root>
  )
}
