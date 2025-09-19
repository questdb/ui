import React, { FC, useCallback, useEffect, useMemo, useState, useContext, useRef } from 'react';
import { Virtuoso, VirtuosoHandle, ListRange } from 'react-virtuoso';
import styled from 'styled-components';
import { Loader3, FileCopy, Restart } from '@styled-icons/remix-line';
import { AutoAwesome } from '@styled-icons/material';
import { spinAnimation, toast } from '../../../components';
import { color, ErrorResult } from '../../../utils';
import * as QuestDB from "../../../utils/questdb";
import { State, View } from "../../Schema";
import LoadingError from "../LoadingError";
import Row, { TreeNodeKind } from "../Row";
import { createTableNode, createColumnNodes, getNodeFromSchemaTree, updateAndGetSchemaTree, findRowIndexById, flattenTree } from "./utils";
import { useRetainLastFocus } from "./useRetainLastFocus"
import { getSectionExpanded, setSectionExpanded, TABLES_GROUP_KEY, MATVIEWS_GROUP_KEY } from "../localStorageUtils";
import { useSchema } from "../SchemaContext";
import { QuestContext } from "../../../providers";
import { PartitionBy } from "../../../utils/questdb/types";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, MenuItem } from "../../../components/ContextMenu"
import { copyToClipboard } from "../../../utils/copyToClipboard"
import { SuspensionDialog } from '../SuspensionDialog'
import { SchemaExplanationDialog } from '../SchemaExplanationDialog'
import { explainTableSchema, isAiAssistantError, AiAssistantAPIError, TableSchemaExplanation } from '../../../utils/aiAssistant'
import { useLocalStorage } from "../../../providers/LocalStorageProvider"
import { useAIStatus, isBlockingAIStatus } from '../../../providers/AIStatusProvider'

type VirtualTablesProps = {
  tables: QuestDB.Table[]
  walTables?: QuestDB.WalTable[]
  materializedViews?: QuestDB.MaterializedView[]
  filterSuspendedOnly: boolean
  state: State
  loadingError: ErrorResult | null
}

export type FlattenedTreeItem = {
  id: string
  kind: TreeNodeKind
  name: string
  value?: string
  table?: QuestDB.Table
  column?: QuestDB.Column
  matViewData?: QuestDB.MaterializedView
  walTableData?: QuestDB.WalTable
  parent?: string
  isExpanded?: boolean
  isLoading?: boolean
  designatedTimestamp?: string
  partitionBy?: PartitionBy
  walEnabled?: boolean
  type?: string
};

export type TreeNode = FlattenedTreeItem & {
  children: TreeNode[]
}

export type TreeNavigationOptions =
  | { to: "start" }
  | { to: "end" }
  | { to: "next", id: string }
  | { to: "previous", id: string }
  | { to: "parent", id: string }
  | { to: "pageUp" }
  | { to: "pageDown" }

export type SchemaTree = {
  [key: string]: TreeNode
}

const SectionHeader = styled(Row)<{ $disabled: boolean }>`
  cursor: ${({ $disabled }) => $disabled ? 'not-allowed' : 'default'};
  pointer-events: ${({ $disabled }) => $disabled ? 'none' : 'auto'};

  ${({ $disabled }) => $disabled && `
    opacity: 0.5;
  `}
`

const TableRow = styled(Row)<{ $contextMenuOpen: boolean }>`
  ${({ $contextMenuOpen, theme }) => $contextMenuOpen && `
    background: ${theme.color.tableSelection};
    border: 1px solid ${theme.color.cyan};
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

const VirtualTables: FC<VirtualTablesProps> = ({
  tables,
  walTables,
  materializedViews,
  filterSuspendedOnly,
  state,
  loadingError,
}) => {
  const { query, focusedIndex, setFocusedIndex } = useSchema()
  const { quest } = useContext(QuestContext)
  const { aiAssistantSettings } = useLocalStorage()
  const { status: aiStatus, setStatus } = useAIStatus()

  const [columnsReady, setColumnsReady] = useState(false)
  const [schemaTree, setSchemaTree] = useState<SchemaTree>({})
  const [openedContextMenu, setOpenedContextMenu] = useState<string | null>(null)
  const [openedSuspensionDialog, setOpenedSuspensionDialog] = useState<string | null>(null)
  const [schemaExplanationDialog, setSchemaExplanationDialog] = useState<{
    tableName: string
    isMatView: boolean
    explanation: TableSchemaExplanation | null
  } | null>(null)

  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const rangeRef = useRef<ListRange | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  useRetainLastFocus({ virtuosoRef, focusedIndex, setFocusedIndex, wrapperRef })

  const [regularTables, matViewTables] = useMemo(() => {
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

    return filtered.reduce((acc, table) => {
      const index = table.matView ? 1 : 0
      acc[index].push(table)
      return acc
    }, [[], []] as QuestDB.Table[][]).map(tables => 
      tables.sort((a, b) => a.table_name.toLowerCase().localeCompare(b.table_name.toLowerCase()))
    )
  }, [tables, query, filterSuspendedOnly, walTables])

  const flattenedItems = useMemo(() => {
    if (!columnsReady) return [];
    
    return Object.values(schemaTree).reduce((acc, node) => {
      acc.push(...flattenTree(node));
      return acc;
    }, [] as FlattenedTreeItem[]);
  }, [schemaTree, columnsReady]);

  const getTableSchema = async (tableName: string, isMatView: boolean): Promise<string | null> => {
    try {
      const response = isMatView
        ? await quest.showMatViewDDL(tableName)
        : await quest.showTableDDL(tableName)

      if (response?.type === QuestDB.Type.DQL && response.data?.[0]?.ddl) {
        return response.data[0].ddl
      }
    } catch (error: any) {
      toast.error(`Cannot fetch schema for ${isMatView ? 'materialized view' : 'table'} '${tableName}'`)
    }
    return null
  }

  const handleCopyQuery = async (tableName: string, isMatView: boolean) => {
    const schema = await getTableSchema(tableName, isMatView)
    if (schema) {
      copyToClipboard(schema)
      toast.success("Schema copied to clipboard")
    }
  }

  const handleExplainSchema = async (tableName: string, isMatView: boolean) => {
    if (!aiAssistantSettings.apiKey) {
      toast.error("AI Assistant is not enabled. Please configure your API key in settings.")
      return
    }

    const schema = await getTableSchema(tableName, isMatView)
    if (!schema) {
      return
    }

    const response = await explainTableSchema({
      tableName,
      schema,
      isMatView,
      settings: aiAssistantSettings,
      setStatus,
    })

    if (isAiAssistantError(response)) {
      const error = response as AiAssistantAPIError
      toast.error(error.message, { autoClose: 10000 })
      return
    }

    const result = response as TableSchemaExplanation
    if (!result.explanation) {
      toast.error("No explanation received from AI Assistant", { autoClose: 10000 })
      return
    }

    setSchemaExplanationDialog({
      tableName,
      isMatView,
      explanation: result
    })
  }

  const fetchColumns = async (name: string) => {
    try {
      const response = await quest.showColumns(name)
      if (response && response.type === QuestDB.Type.DQL) {
        return response.data
      }
    } catch (error: any) {
      toast.error(`Cannot show columns from table '${name}'`)
    }
    return []
  }

  const toggleNodeExpansion = useCallback(async (id: string) => {
    const isExpanded = getSectionExpanded(id)
    const willBeExpanded = !isExpanded
    
    let newTree = { ...schemaTree }
    const modifiedKeys = setSectionExpanded(id, willBeExpanded)
    modifiedKeys.forEach(key => {
      newTree = updateAndGetSchemaTree(newTree, key, node => ({ ...node, isExpanded: willBeExpanded }))
    })
    
    if (id.endsWith(':columns')) {
      const parts = id.split(':');
      const tableName = parts[parts.length - 2]
      if (!willBeExpanded) {
        newTree = updateAndGetSchemaTree(newTree, id, node => ({ ...node, children: [] }))
      } else {
        const columns = await fetchColumns(tableName);
        if (columns) {
          newTree = updateAndGetSchemaTree(newTree, id, node => ({ ...node, children: createColumnNodes(node.table!, id, columns) }))
        }
      }
    }
    setSchemaTree(newTree)
  }, [schemaTree]);

  const navigateInTree = useCallback((options: TreeNavigationOptions) => {
    if (!virtuosoRef.current) {
      return
    }
    const { to } = options

    switch (to) {
      case "start":
        virtuosoRef.current.scrollIntoView({
          index: 0,
          align: 'start',
          done: () => setFocusedIndex(0)
        })
        break
      case "end":
        virtuosoRef.current.scrollIntoView({
          index: flattenedItems.length - 1,
          align: 'end',
          done: () => setFocusedIndex(flattenedItems.length - 1)
        })
        break
      case "next":
        const { id: elementId } = options
        const nextIndex = Math.min(flattenedItems.length - 1, findRowIndexById(flattenedItems, elementId) + 1)
        virtuosoRef.current.scrollIntoView({
          index: nextIndex,
          done: () => setFocusedIndex(nextIndex)
        })
        break
      case "previous":
        const { id } = options
        const prevIndex = Math.max(0, findRowIndexById(flattenedItems, id) - 1)
        virtuosoRef.current.scrollIntoView({
          index: prevIndex,
          done: () => setFocusedIndex(prevIndex)
        })
        break
      case "parent":
        const { id: childId } = options
        const parentId = childId.split(':').slice(0, -1).join(':')
        const parentIndex = findRowIndexById(flattenedItems, parentId)
        if (parentIndex !== -1) {
          virtuosoRef.current.scrollIntoView({
            index: parentIndex,
            done: () => setFocusedIndex(parentIndex)
          })
        }
        break
      case "pageUp":
        if (!rangeRef.current) return
        const { startIndex: upStart, endIndex: upEnd } = rangeRef.current
        const upRangeLength = upEnd - upStart
        const upIndex = focusedIndex !== -1 && focusedIndex !== upStart
          ? upStart
          : Math.max(0, upStart - upRangeLength)
        virtuosoRef.current.scrollIntoView({
          index: upIndex,
          align: 'start',
          done: () => setFocusedIndex(upIndex)
        })
        break
      case "pageDown":
        if (!rangeRef.current) return
        const { startIndex: downStart, endIndex: downEnd } = rangeRef.current
        const downRangeLength = downEnd - downStart
        const downIndex = focusedIndex !== -1 && focusedIndex !== downEnd
          ? downEnd
          : Math.min(flattenedItems.length - 1, downEnd + downRangeLength)
        virtuosoRef.current.scrollIntoView({
          index: downIndex,
          align: 'end',
          done: () => setFocusedIndex(downIndex)
        })
        break
      default:
        break
    }
  }, [flattenedItems, virtuosoRef, rangeRef, focusedIndex, setFocusedIndex])

  const renderRow = useCallback((index: number) => {
    const item = flattenedItems[index];
    
    if (item.kind === 'detail') {
      return (
        <Row
          kind="detail"
          index={index}
          name={item.value ? `${item.name}:` : item.name}
          value={item.value}
          id={item.id}
          onExpandCollapse={() => {}}
          navigateInTree={navigateInTree}
        />
      );
    }
    
    if (item.id === TABLES_GROUP_KEY || item.id === MATVIEWS_GROUP_KEY) {
      const isTable = item.id === TABLES_GROUP_KEY
      return (
        <SectionHeader
          $disabled={isTable ? regularTables.length === 0 : matViewTables.length === 0}
          name={item.name}
          kind="folder"
          index={index}
          expanded={item.isExpanded}
          data-hook={`${item.isExpanded ? 'collapse' : 'expand'}-${isTable ? 'tables' : 'materialized-views'}`}
          onExpandCollapse={() => toggleNodeExpansion(item.id)}
          id={item.id}
          navigateInTree={navigateInTree}
        />
      );
    }
    
    if (item.kind === 'folder') {
      return (
        <Row
          kind="folder"
          index={index}
          name={item.name}
          expanded={item.isExpanded}
          onExpandCollapse={() => toggleNodeExpansion(item.id)}
          id={item.id}
          navigateInTree={navigateInTree}
        />
      );
    }
    
    if (item.kind === 'table' || item.kind === 'matview') {
      return (
        <>
          <ContextMenu onOpenChange={(open) => setOpenedContextMenu(open ? item.id : null)}>
            <ContextMenuTrigger>
              <>
                <TableRow
                  $contextMenuOpen={openedContextMenu === item.id}
                  kind={item.kind}
                  name={item.name}
                  index={index}
                  expanded={item.isExpanded}
                  onExpandCollapse={() => toggleNodeExpansion(item.id)}
                  navigateInTree={navigateInTree}
                  partitionBy={item.partitionBy}
                  walEnabled={item.walEnabled}
                  designatedTimestamp={item.designatedTimestamp}
                  id={item.id}
                  errors={[
                    ...(item.matViewData?.view_status === 'invalid' ? 
                        [`Materialized view is invalid${item.matViewData?.invalidation_reason && `: ${item.matViewData?.invalidation_reason}`}`] : 
                        []),
                    ...(item.walTableData?.suspended ? [`Suspended`] : []),
                  ]}
                />
                {item.walTableData?.suspended && (
                  <SuspensionDialog 
                    walTableData={item.walTableData}
                    kind={item.kind}
                    open={openedSuspensionDialog === item.id}
                    onOpenChange={(isOpen) => {
                      setOpenedSuspensionDialog(isOpen ? item.id : null)
                    }}
                  />
                )}
              </>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <MenuItem
                data-hook="table-context-menu-copy-schema"
                onClick={async () => await handleCopyQuery(item.name, item.kind === 'matview')}
                icon={<FileCopy size={16} />}
              >
                Copy schema
              </MenuItem>
              <MenuItem
                data-hook="table-context-menu-explain-schema"
                onClick={async () => await handleExplainSchema(item.name, item.kind === 'matview')}
                icon={<AutoAwesome size={16} />}
                disabled={!aiAssistantSettings.apiKey || !aiAssistantSettings.grantSchemaAccess || isBlockingAIStatus(aiStatus)}
              >
                Explain schema with AI
              </MenuItem>
              <MenuItem 
                data-hook="table-context-menu-resume-wal"
                onClick={() => item.walTableData?.suspended && setTimeout(() => setOpenedSuspensionDialog(item.id))}
                icon={<Restart size={16} />}
                disabled={!item.walTableData?.suspended}
              >
                Resume WAL
              </MenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </>
      );
    }
    
    if (item.kind === 'column') {
      return (
        <Row
          kind="column"
          name={item.name}
          index={index}
          expanded={item.isExpanded}
          onExpandCollapse={() => toggleNodeExpansion(item.id)}
          designatedTimestamp={item.designatedTimestamp}
          type={item.type}
          id={item.id}
          navigateInTree={navigateInTree}
        />
      );
    }
    
    return null;
  }, [
    flattenedItems,
    regularTables,
    matViewTables,
    toggleNodeExpansion,
    openedContextMenu,
    openedSuspensionDialog,
    navigateInTree,
  ]);

  useEffect(() => {
    if (state.view === View.ready) {
      const fetchColumnsForExpandedTables = async () => {
        const newTree: SchemaTree = {
          [TABLES_GROUP_KEY]: {
            id: TABLES_GROUP_KEY,
            kind: 'folder',
            name: `Tables (${regularTables.length})`,
            isExpanded: regularTables.length === 0 ? false : getSectionExpanded(TABLES_GROUP_KEY),
            children: regularTables.map(table => createTableNode(table, TABLES_GROUP_KEY, false, materializedViews, walTables))
          },
          [MATVIEWS_GROUP_KEY]: {
            id: MATVIEWS_GROUP_KEY,
            kind: 'folder',
            name: `Materialized views (${matViewTables.length})`,
            isExpanded: matViewTables.length === 0 ? false : getSectionExpanded(MATVIEWS_GROUP_KEY),
            children: matViewTables.map(table => createTableNode(table, MATVIEWS_GROUP_KEY, true, materializedViews, walTables))
          }
        };

        const allTables = [...regularTables, ...matViewTables]
        const fetchPromises: Promise<void>[] = []

        for (const table of allTables) {
          const columnsId = `${table.matView ? MATVIEWS_GROUP_KEY : TABLES_GROUP_KEY}:${table.table_name}:columns`
          if (getSectionExpanded(columnsId)) {
            const fetchPromise = fetchColumns(table.table_name).then(columns => {
              if (columns) {
                const result = getNodeFromSchemaTree(newTree, columnsId)
                if (result) {
                  result.node.children = createColumnNodes(table, columnsId, columns)
                  result.node.isExpanded = true
                }
              }
            })
            fetchPromises.push(fetchPromise)
          }
        }

        await Promise.all(fetchPromises)
        setSchemaTree(newTree)
        setColumnsReady(true)
      };

      fetchColumnsForExpandedTables()
    }
  }, [state.view, regularTables, matViewTables, materializedViews]);

  if (state.view === View.loading || (state.view === View.ready && !columnsReady)) {
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
    <>
      <div ref={wrapperRef} style={{ height: '100%' }}>
        <Virtuoso
          totalCount={flattenedItems.length}
          ref={virtuosoRef}
          data-hook="schema-tree"
          rangeChanged={(newRange) => {
            rangeRef.current = newRange
          }}
          data={flattenedItems}
          itemContent={(index) => renderRow(index)}
          style={{ height: '100%' }}
        />
      </div>
      {schemaExplanationDialog && (
        <SchemaExplanationDialog
          open={true}
          onOpenChange={(open) => !open && setSchemaExplanationDialog(null)}
          tableName={schemaExplanationDialog.tableName}
          explanation={schemaExplanationDialog.explanation}
        />
      )}
    </>
  );
}

export default VirtualTables;
