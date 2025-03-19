import React, { FC, useEffect, useMemo, useState } from 'react';
import { GroupedVirtuoso } from 'react-virtuoso';
import styled from 'styled-components';
import { Loader3 } from '@styled-icons/remix-line';
import { spinAnimation } from '../../../components';
import { color, ErrorResult } from '../../../utils';
import * as QuestDB from "../../../utils/questdb";
import { State, View } from "../../Schema";
import Table from "../Table";
import LoadingError from "../LoadingError"
import Row from "../Row";
import { TreeNodeKind } from "../../../components/Tree";

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
  const [tablesExpanded, setTablesExpanded] = useState(false)
  const [matViewsExpanded, setMatViewsExpanded] = useState(false)

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
      groupCounts={groupCounts}
      components={{ TopItemList: ({...props}) => <div {...props} style={{ position: 'unset' }} /> }}
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
              if (index === 0) setTablesExpanded(!tablesExpanded)
              else setMatViewsExpanded(!matViewsExpanded)
            }}
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
          />
        )
      }}
    />
  )
}
