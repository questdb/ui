import React, { useState } from "react"
import styled, { css } from "styled-components"
import { TrashIcon, XIcon } from "@phosphor-icons/react"
import {
  Button,
  IconButton,
  Input,
  PaneContent,
  PaneWrapper,
  Text,
} from "../../components"
import { Panel } from "../../components/Panel"
import { useEditor } from "../../providers"
import {
  sortClosedBuffers,
  sortPinnedBuffers,
} from "../../utils/buffers/tabOrder"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { ClearHistoryDialog } from "../Editor/ClearHistoryDialog"
import { TabSection } from "./TabSection"
import { OpenTabList } from "./OpenTabList"
import { ClosedTabList } from "./ClosedTabList"

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
  padding: 0.4rem 0 1rem;
  && {
    background: ${({ theme }) => theme.color.surfaceRaised};
  }
`

const Filter = styled.div`
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
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

const Empty = styled.div`
  padding: 0.6rem 1rem 0.6rem 2.5rem;
`

const matchesFilter = (label: string, filter: string) =>
  label.toLowerCase().includes(filter.trim().toLowerCase())

export const TabsPanel = ({ open }: Props) => {
  const { buffers, clearArchivedBuffers } = useEditor()
  const [filter, setFilter] = useState("")
  const [clearDialogOpen, setClearDialogOpen] = useState(false)

  const openBuffers = sortPinnedBuffers(buffers).filter((b) =>
    matchesFilter(b.label, filter),
  )
  const closedBuffers = sortClosedBuffers(buffers).filter((b) =>
    matchesFilter(b.label, filter),
  )
  const closedCount = sortClosedBuffers(buffers).length

  const requestClearHistory = (event: React.MouseEvent) => {
    event.stopPropagation()
    setClearDialogOpen(true)
  }

  const clearHistory = () => {
    void trackEvent(ConsoleEvent.TAB_HISTORY_CLEAR)
    void clearArchivedBuffers()
    setClearDialogOpen(false)
  }

  return (
    <Wrapper $open={open} data-hook="tabs-panel">
      <Panel.Header
        title={
          <Filter>
            <FilterInput
              placeholder="Filter tabs..."
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setFilter("")
              }}
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
        }
      />
      <Content>
        <TabSection
          title="Open"
          count={openBuffers.length}
          data-hook="tabs-panel-open"
        >
          {openBuffers.length === 0 ? (
            <Empty>
              <Text color="contentSecondary">No open tabs match</Text>
            </Empty>
          ) : (
            <OpenTabList
              buffers={openBuffers}
              reorderable={filter.trim() === ""}
            />
          )}
        </TabSection>
        <TabSection
          title="Closed"
          count={closedBuffers.length}
          data-hook="tabs-panel-closed"
          trailing={
            closedCount > 0 && (
              <Button
                size="sm"
                variant="dangerQuiet"
                prefixIcon={<TrashIcon size={14} />}
                data-hook="tabs-panel-clear-history"
                onClick={requestClearHistory}
              >
                Delete all
              </Button>
            )
          }
        >
          {closedBuffers.length === 0 ? (
            <Empty>
              <Text color="contentSecondary">
                {closedCount === 0 ? "No closed tabs" : "No closed tabs match"}
              </Text>
            </Empty>
          ) : (
            <ClosedTabList buffers={closedBuffers} />
          )}
        </TabSection>
      </Content>
      <ClearHistoryDialog
        open={clearDialogOpen}
        count={closedCount}
        onDismiss={() => setClearDialogOpen(false)}
        onConfirm={clearHistory}
      />
    </Wrapper>
  )
}
