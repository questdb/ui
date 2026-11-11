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
  Text,
} from "../../components"
import { useEditor, useSettings } from "../../providers"
import { getValue, setValue } from "../../utils/localStorage"
import { StoreKey } from "../../utils/localStorage/types"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { TabSection } from "./TabSection"
import { TabGroupList } from "./TabGroupList"
import { OpenTabList } from "./OpenTabList"
import { ExampleList } from "./ExampleList"
import { buildTabGroups, groupCountLabel, matchesFilter } from "./tabGroups"
import { hasExampleDashboards } from "../../utils/examples/hasExampleDashboards"
import {
  sortClosedBuffers,
  sortPinnedBuffers,
} from "../../utils/buffers/tabOrder"

type ViewMode = "groups" | "list"

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

const Lists = styled.div`
  padding: 1rem 0;
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

const Empty = styled.div`
  padding: 0.6rem 1rem 0.6rem 2.5rem;
`

const readIncludeClosed = () =>
  getValue(StoreKey.TABS_PANEL_INCLUDE_CLOSED) === "true"

const readViewMode = (): ViewMode =>
  getValue(StoreKey.TABS_PANEL_VIEW_MODE) === "list" ? "list" : "groups"

export const TabsPanel = ({ open }: Props) => {
  const { buffers } = useEditor()
  const { consoleConfig } = useSettings()
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

  const hasExamples = hasExampleDashboards(consoleConfig)
  const examples = hasExamples
    ? consoleConfig.exampleDashboards!.filter((example) =>
        matchesFilter(example.title, filter),
      )
    : []
  const groups = buildTabGroups(buffers, { includeClosed, filter })

  // List mode mirrors the tab bar: every open tab in bar order (examples
  // included, once open), then closed tabs. Examples that are not open have
  // no tab, so they are not listed.
  const userTabs = buffers.filter(
    (buffer) => !buffer.isPreviewBuffer && matchesFilter(buffer.label, filter),
  )
  const openTabs = sortPinnedBuffers(userTabs)
  const closedTabs = sortClosedBuffers(userTabs)

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
        <Lists>
          {viewMode === "groups" ? (
            <>
              {hasExamples && (
                <TabSection
                  title="Example dashboards"
                  count={String(examples.length)}
                  data-hook="tabs-panel-examples"
                >
                  {examples.length === 0 ? (
                    <Empty>
                      <Text color="contentSecondary">No examples match</Text>
                    </Empty>
                  ) : (
                    <ExampleList examples={examples} />
                  )}
                </TabSection>
              )}
              {groups.map((group) => (
                <TabSection
                  key={group.type}
                  title={group.title}
                  count={groupCountLabel(group, includeClosed)}
                  // With examples configured the panel is a showcase: keep
                  // the visitor's eye on the examples and fold the rest.
                  defaultExpanded={!hasExamples}
                  data-hook={`tabs-panel-group-${group.type.toLowerCase()}`}
                >
                  <TabGroupList rows={group.rows} />
                </TabSection>
              ))}
              {groups.length === 0 && !hasExamples && (
                <Empty data-hook="tabs-panel-empty">
                  <Text color="contentSecondary">
                    {filter.trim() === "" ? "No tabs" : "No tabs match"}
                  </Text>
                </Empty>
              )}
            </>
          ) : (
            <>
              <TabSection
                title="Open"
                count={String(openTabs.length)}
                data-hook="tabs-panel-open"
              >
                {openTabs.length === 0 ? (
                  <Empty>
                    <Text color="contentSecondary">No open tabs match</Text>
                  </Empty>
                ) : (
                  <OpenTabList
                    buffers={openTabs}
                    reorderable={filter.trim() === ""}
                  />
                )}
              </TabSection>
              <TabSection
                title="Closed"
                count={String(closedTabs.length)}
                data-hook="tabs-panel-closed"
              >
                {closedTabs.length === 0 ? (
                  <Empty>
                    <Text color="contentSecondary">
                      {filter.trim() === ""
                        ? "No closed tabs"
                        : "No closed tabs match"}
                    </Text>
                  </Empty>
                ) : (
                  <TabGroupList rows={closedTabs} />
                )}
              </TabSection>
            </>
          )}
        </Lists>
      </Content>
    </Wrapper>
  )
}
