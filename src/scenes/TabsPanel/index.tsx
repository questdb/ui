import React, { useRef, useState } from "react"
import styled, { css } from "styled-components"
import { ListIcon, SquaresFourIcon, XIcon } from "@phosphor-icons/react"
import {
  Checkbox,
  IconButton,
  Input,
  PaneContent,
  PaneHeader,
  PaneHeaderRow,
  PaneWrapper,
  SegmentedControl,
  SegmentedControlButton,
  SelectMenu,
  TOOLBAR_CONTROL_HEIGHT,
} from "../../components"
import { getValue, setValue } from "../../utils/localStorage"
import { StoreKey } from "../../utils/localStorage/types"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { TabLists, type SortOrder, type ViewMode } from "./TabLists"
import {
  enterTabListFromFilter,
  focusAndReveal,
  getTabTreeEntry,
  navigateTabList,
} from "./keyboard"

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
  overflow: hidden;
  && {
    background: ${({ theme }) => theme.color.surfaceRaised};
  }
`

// Only the tab lists scroll; the filter and view options stay in view, as in
// the Search panel.
const ListScroller = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
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
  flex-wrap: wrap;
  align-items: stretch;
  justify-content: space-between;
  gap: 0.6rem 0.2rem;
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
  flex-shrink: 0;
  background: ${({ theme }) => theme.color.controlTrack};
`

const SortTrigger = styled(SelectMenu.Trigger)<{ $hideFocusRing: boolean }>`
  flex-shrink: 0;
  width: 138px;
  height: auto;
  min-height: ${TOOLBAR_CONTROL_HEIGHT};
  margin-inline-start: auto;
  gap: 0.4rem;
  padding: 0 0.6rem;

  > svg {
    width: 1.4rem;
  }

  ${({ $hideFocusRing }) =>
    $hideFocusRing &&
    css`
      &&:focus-visible {
        outline: none;
        border-color: ${({ theme }) => theme.color.borderStrong};
      }
    `}
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

const sortLabels = {
  name: "Alphabetical (A-Z)",
  "name-desc": "Alphabetical (Z-A)",
  newest: "Newest first",
  oldest: "Oldest first",
  tabBar: "Position",
} satisfies Record<SortOrder, string>

const isSortOrder = (value: string): value is SortOrder =>
  Object.prototype.hasOwnProperty.call(sortLabels, value)

const readSortOrder = (): SortOrder => {
  const value = getValue(StoreKey.TABS_PANEL_SORT_ORDER)
  return isSortOrder(value) ? value : "name"
}

export const TabsPanel = ({ open }: Props) => {
  const [filter, setFilter] = useState("")
  const [includeClosed, setIncludeClosed] = useState(readIncludeClosed)
  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode)
  const [sortOrder, setSortOrder] = useState(readSortOrder)
  const sortLabel = sortLabels[sortOrder]
  const sortTriggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const lastTreeItem = useRef<HTMLElement | null>(null)
  const [treeItemFocused, setTreeItemFocused] = useState(false)
  const [hideSortFocusRing, setHideSortFocusRing] = useState(false)

  const handleSortCloseAutoFocus = () => {
    // Let the menu restore focus first. A click outside can focus elsewhere.
    queueMicrotask(() => {
      if (sortTriggerRef.current === document.activeElement) {
        setHideSortFocusRing(true)
      }
    })
  }

  const handleTreeFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const { target, currentTarget } = event
    if (!currentTarget.contains(target)) return
    if (target === currentTarget) {
      const entry = getTabTreeEntry(currentTarget, lastTreeItem.current)
      if (entry) focusAndReveal(entry)
    } else if (target.matches('[role="treeitem"]')) {
      lastTreeItem.current = target
      setTreeItemFocused(true)
    }
  }

  const changeViewMode = (next: ViewMode) => {
    if (next === viewMode) return
    setViewMode(next)
    setValue(StoreKey.TABS_PANEL_VIEW_MODE, next)
    void trackEvent(ConsoleEvent.TAB_PANEL_VIEW_MODE, { mode: next })
  }

  const changeSortOrder = (value: string) => {
    if (!isSortOrder(value)) return
    setSortOrder(value)
    setValue(StoreKey.TABS_PANEL_SORT_ORDER, value)
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
        <PaneHeader>
          <PaneHeaderRow>
            <FilterInput
              placeholder="Filter tabs..."
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={(event) => {
                if (
                  filter &&
                  event.key === "Escape" &&
                  !event.defaultPrevented
                ) {
                  event.preventDefault()
                  setFilter("")
                }
                enterTabListFromFilter(event, listRef.current)
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
          </PaneHeaderRow>
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
                title="List open and closed tabs"
                data-hook="tabs-panel-view-list"
              >
                <ListIcon />
                List
              </ViewSegment>
            </ViewToggle>
            {viewMode === "list" ? (
              <SelectMenu.Root>
                <SortTrigger
                  ref={sortTriggerRef}
                  $hideFocusRing={hideSortFocusRing}
                  onBlur={() => setHideSortFocusRing(false)}
                  label={sortLabel}
                  aria-label={`Sort open tabs: ${sortLabel}`}
                  title={sortLabel}
                  dataHook="tabs-panel-sort"
                />
                <SelectMenu.Portal>
                  <SelectMenu.Content
                    align="end"
                    sideOffset={4}
                    onCloseAutoFocus={handleSortCloseAutoFocus}
                  >
                    <SelectMenu.RadioGroup
                      value={sortOrder}
                      onValueChange={changeSortOrder}
                    >
                      {Object.entries(sortLabels).map(([value, label]) => (
                        <SelectMenu.Item
                          key={value}
                          value={value}
                          data-hook={`tabs-panel-sort-${value === "tabBar" ? "tab-bar" : value}`}
                        >
                          {label}
                        </SelectMenu.Item>
                      ))}
                    </SelectMenu.RadioGroup>
                  </SelectMenu.Content>
                </SelectMenu.Portal>
              </SelectMenu.Root>
            ) : (
              <Option>
                <Checkbox
                  id="tabs-panel-include-closed"
                  checked={includeClosed}
                  onChange={toggleIncludeClosed}
                  data-hook="tabs-panel-include-closed"
                />
                <OptionLabel htmlFor="tabs-panel-include-closed">
                  Include closed tabs
                </OptionLabel>
              </Option>
            )}
          </Options>
        </PaneHeader>
        <ListScroller
          ref={listRef}
          role="tree"
          aria-label="Tabs"
          tabIndex={open && !treeItemFocused ? 0 : -1}
          data-hook="tabs-panel-lists"
          onKeyDown={navigateTabList}
          onFocus={handleTreeFocus}
          onBlur={(event) => {
            const next = event.relatedTarget
            if (
              !(next instanceof Node) ||
              !event.currentTarget.contains(next)
            ) {
              setTreeItemFocused(false)
            }
          }}
        >
          {open && (
            <TabLists
              filter={filter}
              includeClosed={includeClosed}
              viewMode={viewMode}
              sortOrder={sortOrder}
            />
          )}
        </ListScroller>
      </Content>
    </Wrapper>
  )
}
