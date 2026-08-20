import React from "react"
import styled from "styled-components"
import { Error as ErrorIcon } from "../../../components/icons"
import { XIcon } from "@phosphor-icons/react"
import { Box, Button, IconButton, Tooltip, Input } from "../../../components"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"
import { useSchema } from "../SchemaContext"
import { useLocalStorage } from "../../../providers/LocalStorageProvider"

const Root = styled(Box).attrs({
  justifyContent: "space-between",
  gap: "1rem",
  alignItems: "center",
})`
  width: 100%;
  padding-right: 1rem;
  min-width: 14rem;
`

const Filter = styled.div`
  position: relative;
  display: flex;
  width: 100%;
`

const ClearButton = styled(IconButton)`
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
    color: ${({ theme }) => theme.color.contentSecondary};
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
          <ClearButton
            label="Clear schema filter"
            size="sm"
            onClick={() => {
              setQuery("")
              if (queryRef.current?.value) {
                queryRef.current.value = ""
              }
            }}
            data-hook="schema-search-clear-button"
          >
            <XIcon size={18} />
          </ClearButton>
        )}
        <StyledInput
          ref={queryRef}
          name="table_filter"
          placeholder="Filter..."
          onFocus={() => void trackEvent(ConsoleEvent.SCHEMA_FILTER)}
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
        <Box gap="0.5rem">
          <Tooltip placement="bottom" content="Show suspended tables">
            <Button
              variant="dangerGhost"
              onClick={() => {
                void trackEvent(ConsoleEvent.SCHEMA_FILTER_SUSPENDED, {
                  enabled: !filterSuspendedOnly,
                })
                setFilterSuspendedOnly(!filterSuspendedOnly)
              }}
              prefixIcon={<ErrorIcon size="18px" />}
              data-hook="schema-filter-suspended-button"
            >
              {suspendedTablesCount}
            </Button>
          </Tooltip>
        </Box>
      )}
    </Root>
  )
}
