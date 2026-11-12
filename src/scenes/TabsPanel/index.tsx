import React, { useState } from "react"
import styled, { css } from "styled-components"
import { ListIcon, SquaresFourIcon, XIcon } from "@phosphor-icons/react"
import {
  Checkbox,
  IconButton,
  Input,
  PaneContent,
  PaneWrapper,
  SegmentedControl,
  SegmentedControlButton,
} from "../../components"
import { getValue, setValue } from "../../utils/localStorage"
import { StoreKey } from "../../utils/localStorage/types"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { TabLists, type ViewMode } from "./TabLists"

type Props = {
  open: boolean
}

const Wrapper = styled(PaneWrapper)<{ $open: boolean }>`
  height: 100%;
  && {
    background: ${({ theme }) => theme.color.surfaceRaised};
  }
  ${({ $open }) =>
    !$open &&
    css`
      display: none;
    `}
`

const Content = styled(PaneContent)`
  display: flex;
  flex-direction: column;
  overflow: auto;
  && {
    background: ${({ theme }) => theme.color.surfaceRaised};
  }
`

// Same frame as the Search panel: input and option above the divider, with
// the same spacing around it, and the list starting a step below.
const FilterContainer = styled.div`
  padding: 1.2rem 1.4rem 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.borderSubtle};
`

const Filter = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  height: 4.5rem;
  width: 100%;
`

const FilterInput = styled(Input)`
  width: 100%;
  padding-left: 0.75rem;
  padding-right: 3.2rem;

  &::placeholder {
    color: ${({ theme }) => theme.color.contentSecondary};
  }
`

const ClearFilterButton = styled(IconButton)`
  position: absolute;
  top: 50%;
  right: 0.3rem;
  transform: translateY(-50%);
`

const Options = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 3.2rem;
  padding: 0.4rem 0;

  input {
    margin-left: 0;
  }
`

const Option = styled.div`
  display: flex;
  align-items: center;
`

const ViewToggle = styled(SegmentedControl)`
  background: ${({ theme }) => theme.color.controlTrack};
`

const ViewSegment = styled(SegmentedControlButton)`
  svg {
    width: 1.6rem;
    height: 1.6rem;
  }
`

const OptionLabel = styled.label`
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: 1.2rem;
  margin-left: 0.6rem;
  cursor: pointer;
`

const readIncludeClosed = () =>
  getValue(StoreKey.TABS_PANEL_INCLUDE_CLOSED) === "true"

const readViewMode = (): ViewMode =>
  getValue(StoreKey.TABS_PANEL_VIEW_MODE) === "list" ? "list" : "groups"

export const TabsPanel = ({ open }: Props) => {
  const [filter, setFilter] = useState("")
  const [includeClosed, setIncludeClosed] = useState(readIncludeClosed)
  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode)

  const changeViewMode = (next: ViewMode) => {
    if (next === viewMode) return
    setViewMode(next)
    setValue(StoreKey.TABS_PANEL_VIEW_MODE, next)
    void trackEvent(ConsoleEvent.TAB_PANEL_VIEW_MODE, { mode: next })
  }

  const toggleIncludeClosed = () => {
    const next = !includeClosed
    setIncludeClosed(next)
    setValue(StoreKey.TABS_PANEL_INCLUDE_CLOSED, String(next))
    void trackEvent(ConsoleEvent.TAB_PANEL_INCLUDE_CLOSED, { enabled: next })
  }

  return (
    <Wrapper $open={open} data-hook="tabs-panel">
      <Content>
        <FilterContainer>
          <Filter>
            <FilterInput
              placeholder="Filter tabs..."
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setFilter("")
              }}
              aria-label="Filter tabs"
              data-hook="tabs-panel-filter"
            />
            {filter && (
              <ClearFilterButton
                label="Clear tab filter"
                size="sm"
                onClick={() => setFilter("")}
                data-hook="tabs-panel-filter-clear"
              >
                <XIcon size={16} />
              </ClearFilterButton>
            )}
          </Filter>
          <Options>
            <ViewToggle
              role="group"
              aria-label="View mode"
              data-hook="tabs-panel-view-mode"
            >
              <ViewSegment
                type="button"
                $size="sm"
                $active={viewMode === "groups"}
                $activeTone="neutral"
                aria-pressed={viewMode === "groups"}
                onClick={() => changeViewMode("groups")}
                title="Group tabs by kind"
                data-hook="tabs-panel-view-groups"
              >
                <SquaresFourIcon />
                Groups
              </ViewSegment>
              <ViewSegment
                type="button"
                $size="sm"
                $active={viewMode === "list"}
                $activeTone="neutral"
                aria-pressed={viewMode === "list"}
                onClick={() => changeViewMode("list")}
                title="List tabs in tab bar order"
                data-hook="tabs-panel-view-list"
              >
                <ListIcon />
                List
              </ViewSegment>
            </ViewToggle>
            <Option>
              {viewMode === "groups" && (
                <>
                  <Checkbox
                    id="tabs-panel-include-closed"
                    checked={includeClosed}
                    onChange={toggleIncludeClosed}
                    data-hook="tabs-panel-include-closed"
                  />
                  <OptionLabel htmlFor="tabs-panel-include-closed">
                    Include closed tabs
                  </OptionLabel>
                </>
              )}
            </Option>
          </Options>
        </FilterContainer>
        {open && (
          <TabLists
            filter={filter}
            includeClosed={includeClosed}
            viewMode={viewMode}
          />
        )}
      </Content>
    </Wrapper>
  )
}
