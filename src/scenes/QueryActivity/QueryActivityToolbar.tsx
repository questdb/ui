import React from "react"
import styled from "styled-components"
import {
  MagnifyingGlassIcon,
  SortAscendingIcon,
  SortDescendingIcon,
  XIcon,
} from "@phosphor-icons/react"
import {
  Box,
  IconButton,
  Input,
  PrimaryToggleButton,
  SelectMenu,
  Tooltip,
} from "../../components"
import { Refresh } from "../../components/icons"
import { Section } from "../Schema/TableDetailsDrawer/shared-styles"
import {
  formatOrder,
  QUERY_ACTIVITY_ORDER_OPTIONS,
  toOrderKey,
  type QueryActivityOrder,
  type QueryActivityOrderKey,
  type QueryActivitySortDirection,
} from "./queryActivity"

type Props = {
  filter: string
  onFilterChange: (filter: string) => void
  order: QueryActivityOrder
  onOrderChange: (order: QueryActivityOrder) => void
  autoRefresh: boolean
  onAutoRefreshToggle: () => void
}

const CONTROL_HEIGHT = "3rem"

const ToolbarSection = styled(Section)`
  padding: 2rem 1.5rem;
`

const ToolbarRow = styled(Box).attrs({
  align: "center",
  gap: "1rem",
})`
  width: 100%;
`

const SearchContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
`

const SearchIcon = styled.div`
  position: absolute;
  left: 1rem;
  display: flex;
  align-items: center;
  color: ${({ theme }) => theme.color.contentSecondary};
  pointer-events: none;
  z-index: 1;
`

const ClearButton = styled(IconButton).attrs({
  label: "Clear search",
  variant: "ghost",
  size: "sm",
})`
  position: absolute;
  right: 0.4rem;
  min-width: 2rem;
  width: 2rem;
  height: 2rem;
`

const SearchInput = styled(Input)<{ $padRight: boolean }>`
  width: 100%;
  height: ${CONTROL_HEIGHT};
  padding: 0 ${({ $padRight }) => ($padRight ? "2.3rem" : "0")} 0 3.2rem;

  &::placeholder {
    font-size: 1.2rem;
  }
`

const SortTrigger = styled(SelectMenu.Trigger)`
  && {
    height: ${CONTROL_HEIGHT};
    min-height: ${CONTROL_HEIGHT};
  }
  width: 16rem;
`

const AutoRefreshButton = styled(PrimaryToggleButton)`
  &&:not(:disabled) {
    width: auto;
    padding: 0 1rem;
    height: ${CONTROL_HEIGHT};
  }
`

const DIRECTION_ICONS: Record<QueryActivitySortDirection, React.ReactNode> = {
  desc: <SortAscendingIcon />,
  asc: <SortDescendingIcon />,
}

const orderForKey = (key: QueryActivityOrderKey): QueryActivityOrder =>
  QUERY_ACTIVITY_ORDER_OPTIONS.find((option) => option.key === key)?.order ??
  QUERY_ACTIVITY_ORDER_OPTIONS[0].order

export const QueryActivityToolbar = ({
  filter,
  onFilterChange,
  order,
  onOrderChange,
  autoRefresh,
  onAutoRefreshToggle,
}: Props) => (
  <ToolbarSection>
    <ToolbarRow>
      <SearchContainer>
        <SearchIcon>
          <MagnifyingGlassIcon size={16} />
        </SearchIcon>
        <SearchInput
          type="text"
          placeholder="Query text, id, or username"
          value={filter}
          $padRight={!!filter}
          onChange={(event) => onFilterChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && filter) onFilterChange("")
          }}
          data-hook="query-activity-search"
        />
        {filter && (
          <ClearButton
            onClick={() => onFilterChange("")}
            data-hook="query-activity-search-clear"
          >
            <XIcon size={12} />
          </ClearButton>
        )}
      </SearchContainer>
      <SelectMenu.Root>
        <SortTrigger
          type="button"
          aria-label="Sort queries"
          label={formatOrder(order)}
          leadingIcon={DIRECTION_ICONS[order.direction]}
          dataHook="query-activity-sort-trigger"
        />
        <SelectMenu.Portal>
          <SelectMenu.Content align="start" sideOffset={4}>
            <SelectMenu.Label>Sort by</SelectMenu.Label>
            <SelectMenu.RadioGroup
              value={toOrderKey(order)}
              onValueChange={(value) =>
                onOrderChange(orderForKey(value as QueryActivityOrderKey))
              }
            >
              {QUERY_ACTIVITY_ORDER_OPTIONS.map((option) => (
                <SelectMenu.Item
                  key={option.key}
                  value={option.key}
                  icon={DIRECTION_ICONS[option.order.direction]}
                  data-hook={`query-activity-sort-${option.order.sort}-${option.order.direction}`}
                >
                  {option.label}
                </SelectMenu.Item>
              ))}
            </SelectMenu.RadioGroup>
          </SelectMenu.Content>
        </SelectMenu.Portal>
      </SelectMenu.Root>
      <Tooltip
        delay={350}
        placement="bottom"
        content={`Auto refresh ${autoRefresh ? "enabled" : "disabled"}`}
      >
        <AutoRefreshButton
          aria-label={`Auto refresh ${autoRefresh ? "enabled" : "disabled"}`}
          data-hook="query-activity-auto-refresh-button"
          onClick={onAutoRefreshToggle}
          selected={autoRefresh}
        >
          <Refresh size="18px" />
        </AutoRefreshButton>
      </Tooltip>
    </ToolbarRow>
  </ToolbarSection>
)
