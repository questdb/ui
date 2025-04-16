import React, { FC, useCallback, useEffect, useMemo, useState, useRef, useContext } from 'react';
import { GroupedVirtuoso, GroupedVirtuosoHandle } from 'react-virtuoso';
import styled from 'styled-components';
import { Loader3 } from '@styled-icons/remix-line';
import { spinAnimation } from '../../../components';
import { color, ErrorResult } from '../../../utils';
import * as QuestDB from "../../../utils/questdb";
import { State, View } from "../../Schema";
import Table from "../Table";
import LoadingError from "../LoadingError";
import Row, { isElementVisible, computeFocusableElements } from "../Row";
import { TreeNodeKind } from "../../../components/Tree";
import { getSectionExpanded, setSectionExpanded, TABLES_GROUP_KEY, MATVIEWS_GROUP_KEY } from "../localStorageUtils";
import { useSchema } from "../SchemaContext";

type VirtualTablesProps = {
  tables: QuestDB.Table[]
  walTables?: QuestDB.WalTable[]
  materializedViews?: QuestDB.MaterializedView[]
  selectOpen: boolean
  selectedTables: {name: string, type: TreeNodeKind}[]
  handleSelectToggle: ({name, type}: {name: string, type: TreeNodeKind}) => void
  filterSuspendedOnly: boolean
  query: string
  state: State
  loadingError: ErrorResult | null
}

type ColumnsCache = {
  [tableName: string]: QuestDB.Column[];
};

const SectionHeader = styled(Row)<{ $disabled: boolean }>`
  cursor: ${({ $disabled }) => $disabled ? 'not-allowed' : 'pointer'};
  pointer-events: ${({ $disabled }) => $disabled ? 'none' : 'auto'};
    
  &:hover {
    background: ${({ $disabled }) => $disabled ? color("selectionDarker") : color("selection")};
  }

  ${({ $disabled }) => $disabled && `
    opacity: 0.5;
  `}
`

const FlexSpacer = styled.div`
  flex: 1;
`

const Loader = styled(Loader3)`
  margin-left: 1rem;
  align-self: center;
  color: ${color("foreground")};
  ${spinAnimation};
`

const Loading = () => {
  const [loaderShown, setLoaderShown] = useState(false)
  // Show the loader only for delayed fetching process
  useEffect(() => {
      const timeout = setTimeout(() => setLoaderShown(true), 1000)
      return () => clearTimeout(timeout)
  }, [])

  return loaderShown ? <Loader size="22px" /> : null
}

export const VirtualTables: FC<VirtualTablesProps> = ({
  tables,
  walTables,
  materializedViews,
  selectOpen,
  selectedTables,
  handleSelectToggle,
  filterSuspendedOnly,
  query,
  state,
  loadingError
}) => {
  const { scrollerRef, setScrollerRef } = useSchema()
  const isScrollingRef = useRef(false)
  const columnsCache = useRef<ColumnsCache>({});
  const virtuosoRef = useRef<GroupedVirtuosoHandle>(null)

  const [, setToggle] = useState(false);
  const forceUpdate = () => setToggle(toggle => !toggle)
  const tablesExpanded = getSectionExpanded(TABLES_GROUP_KEY)
  const matViewsExpanded = getSectionExpanded(MATVIEWS_GROUP_KEY)

  const { groups, groupCounts, allTables } = useMemo(() => {
    const filtered = tables.filter((table: QuestDB.Table) => {
      const normalizedTableName = table.table_name.toLowerCase()
      const normalizedQuery = query.toLowerCase()
      return (
        normalizedTableName.includes(normalizedQuery) &&
        (filterSuspendedOnly
          ? table.walEnabled &&
            walTables?.find((t) => t.name === table.table_name)
              ?.suspended
          : true)
      )
    })

    const [regularTables, matViewTables] = filtered.reduce((acc, table) => {
      const index = table.matView ? 1 : 0
      acc[index].push(table)
      return acc
    }, [[], []] as QuestDB.Table[][]).map(tables => 
      tables.sort((a, b) => a.table_name.toLowerCase().localeCompare(b.table_name.toLowerCase()))
    )

    return {
      groups: [
        { name: 'Tables', count: regularTables.length, expanded: tablesExpanded },
        { name: 'Materialized views', count: matViewTables.length, expanded: matViewsExpanded }
      ],
      groupCounts: [
        tablesExpanded ? regularTables.length : 0,
        matViewsExpanded ? matViewTables.length : 0,
      ],
      allTables: [
        ...(tablesExpanded ? regularTables : []),
        ...(matViewsExpanded ? matViewTables : []),
      ]
    }
  }, [tables, query, filterSuspendedOnly, walTables, tablesExpanded, matViewsExpanded])

  const handleScrollerRef = useCallback((scroller: HTMLElement | Window | null) => {
    const handleKeyDown = () => {
      if (!scrollerRef.current) return
      const focusedElement = document.querySelector(`[data-path].focused`) as HTMLElement

      if (focusedElement && !isElementVisible(focusedElement, scrollerRef.current)) {
        const elementRect = focusedElement.getBoundingClientRect()
        const scrollerRect = scrollerRef.current.getBoundingClientRect()
        
        const scrollTop = scrollerRef.current.scrollTop
        const elementTop = elementRect.top - scrollerRect.top + scrollTop
        const elementBottom = elementRect.bottom - scrollerRect.top + scrollTop
   
        if (elementTop < scrollTop) {
          scrollerRef.current.scrollTo({ top: elementTop })
        } else if (elementBottom > scrollTop + scrollerRect.height) {
          scrollerRef.current.scrollTo({ top: elementBottom - scrollerRect.height })
        }
      }
    }
    scrollerRef.current?.removeEventListener('keydown', handleKeyDown as EventListener)
    setScrollerRef(scroller as HTMLElement)

    if (scrollerRef.current) {
      scrollerRef.current.addEventListener('keydown', handleKeyDown as EventListener)
    }
  }, [])

  const handleScrolling = (isScrolling: boolean) => {
    const focusedElement = document.querySelector(`[data-path].focused`) as HTMLElement

    if (isScrollingRef.current && !isScrolling && !focusedElement && scrollerRef.current) {
      const focusableElement = computeFocusableElements(scrollerRef.current)[0] as HTMLElement
      focusableElement?.focus();
    }
    isScrollingRef.current = isScrolling
  }

  useEffect(() => {
    if (!tablesExpanded) {
      setSectionExpanded(TABLES_GROUP_KEY, true)
      forceUpdate()
    }
  }, [])

  if (state.view === View.loading) {
    return <Loading />
  }

  if (state.view === View.error) {
    return loadingError ? (
      <LoadingError error={loadingError} />
    ) : (
      <FlexSpacer />
    )
  }

  return (
    <GroupedVirtuoso
      ref={virtuosoRef}
      isScrolling={handleScrolling}
      groupCounts={groupCounts}
      increaseViewportBy={{ top: 1000, bottom: 1000 }}
      scrollerRef={handleScrollerRef}
      components={{ TopItemList: React.Fragment }}
      groupContent={index => {
        const group = groups[index]
        
        return (
          <SectionHeader
            $disabled={group.count === 0}
            name={`${group.name} (${group.count})`}
            kind="folder"
            expanded={group.count === 0 ? false : index === 0 ? tablesExpanded : matViewsExpanded}
            data-hook={(() => {
              if (index === 0) {
                return `${tablesExpanded ? 'collapse' : 'expand'}-tables`
              }
              return `${matViewsExpanded ? 'collapse' : 'expand'}-materialized-views`
            })()}
            onClick={() => {
              setSectionExpanded(index === 0 ? TABLES_GROUP_KEY : MATVIEWS_GROUP_KEY, !group.expanded);
              forceUpdate();
            }}
            tabIndex={index === 0 ? 100 : 200}
            path={index === 0 ? TABLES_GROUP_KEY : MATVIEWS_GROUP_KEY}
          />
        )
      }}
      itemContent={(index) => {
        if (allTables.length === 0) {
          return null
        }
        const table = allTables[index]
        const matViewData = materializedViews?.find(
          (mv) => mv.view_name === table.table_name,
        )
        const selected = !!(selectedTables.find((t) =>
          t.name === table.table_name
          && t.type === (table.matView ? "matview" : "table")
        ))
        
        return (
          <Table
            matView={table.matView}
            designatedTimestamp={table.designatedTimestamp}
            key={table.table_name}
            id={table.id}
            table_name={table.table_name}
            partitionBy={table.partitionBy}
            ttlValue={table.ttlValue}
            ttlUnit={table.ttlUnit}
            walEnabled={table.walEnabled}
            walTableData={walTables?.find(
              (wt) => wt.name === table.table_name,
            )}
            matViewData={matViewData}
            dedup={table.dedup}
            selectOpen={selectOpen}
            selected={selected}
            onSelectToggle={handleSelectToggle}
            columnsCache={columnsCache}
            path={`${table.matView ? MATVIEWS_GROUP_KEY : TABLES_GROUP_KEY}:${table.table_name}`}
          />
        )
      }}
    />
  )
}
