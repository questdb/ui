import React from "react"
import styled from "styled-components"
import { Close } from "@styled-icons/remix-line"
import { Error as ErrorIcon } from "@styled-icons/boxicons-regular"
import { Box, Button, PopperHover, Tooltip, Input } from "../../../components"
import { useSchema } from "../SchemaContext"
import { useLocalStorage } from "../../../providers/LocalStorageProvider"

const Root = styled(Box).attrs({
  justifyContent: "space-between",
  gap: "1rem",
  alignItems: "center",
})`
  width: 100%;
  padding-right: 2rem;
`

const Filter = styled.div`
  position: relative;
  display: flex;
  width: 100%;
`

const CloseIcon = styled(Close)`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  right: 0.5rem;
`

const StyledInput = styled(Input)`
  padding-left: 0.75rem;
  padding-right: 3.5rem;
  width: 100%;

  &::placeholder {
    color: ${({ theme }) => theme.color.gray2};
  }

  &::selection {
    background: rgba(255, 255, 255, 0.3);
    color: inherit;
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
  const { setQuery } = useSchema()
  const { leftPanelState, updateLeftPanelState } = useLocalStorage()
  const queryRef = React.useRef<HTMLInputElement>(null)

  return (
    <Root>
      <Filter>
        {queryRef.current?.value && (
          <CloseIcon
            size="20px"
            onClick={() => {
              setQuery("")
              if (queryRef.current?.value) {
                queryRef.current.value = ""
              }
            }}
            data-hook="schema-search-clear-button"
          />
        )}
        <StyledInput
          ref={queryRef}
          name="table_filter"
          placeholder="Filter..."
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Escape") {
              if (
                queryRef.current?.value &&
                queryRef.current.value.length > 0
              ) {
                setQuery("")
                queryRef.current.value = ""
              } else {
                updateLeftPanelState({
                  type: null,
                  width: leftPanelState.width,
                })
              }
            }
          }}
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
