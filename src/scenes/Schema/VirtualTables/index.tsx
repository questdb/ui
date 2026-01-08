import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useContext,
  useRef,
} from "react"
import { Virtuoso, VirtuosoHandle, ListRange } from "react-virtuoso"
import styled from "styled-components"
import { Loader3, FileCopy, Restart } from "@styled-icons/remix-line"
import { spinAnimation, toast } from "../../../components"
import { color, ErrorResult } from "../../../utils"
import * as QuestDB from "../../../utils/questdb"
import { State, View } from "../../Schema"
import LoadingError from "../LoadingError"
import Row, { TreeNodeKind } from "../Row"
import {
  createTableNode,
  updateAndGetSchemaTree,
  getNodeFromSchemaTree,
  findRowIndexById,
  flattenTree,
  createSymbolDetailsNodes,
  createSymbolDetailsPlaceholderNodes,
} from "./utils"
import { useRetainLastFocus } from "./useRetainLastFocus"
import {
  getSectionExpanded,
  setSectionExpanded,
  TABLES_GROUP_KEY,
  MATVIEWS_GROUP_KEY,
  VIEWS_GROUP_KEY,
} from "../localStorageUtils"
import { useSchema } from "../SchemaContext"
import { QuestContext } from "../../../providers"
import { PartitionBy, SymbolColumnDetails } from "../../../utils/questdb/types"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  MenuItem,
} from "../../../components/ContextMenu"
import { copyToClipboard } from "../../../utils/copyToClipboard"
import { SuspensionDialog } from "../SuspensionDialog"
import {
  explainTableSchema,
  isAiAssistantError,
  schemaExplanationToMarkdown,
  type ActiveProviderSettings,
  getExplainSchemaPrompt,
} from "../../../utils/aiAssistant"
import { useAIConversation } from "../../../providers/AIConversationProvider"
import {
  useAIStatus,
  isBlockingAIStatus,
  type AIOperationStatus,
  type StatusArgs,
  type OperationHistory,
} from "../../../providers/AIStatusProvider"
import { providerForModel } from "../../../utils/aiAssistantSettings"
import { AISparkle } from "../../../components/AISparkle"

type VirtualTablesProps = {
  tables: QuestDB.Table[]
  walTables?: QuestDB.WalTable[]
  materializedViews?: QuestDB.MaterializedView[]
  views?: QuestDB.View[]
  filterSuspendedOnly: boolean
  state: State
  loadingError: ErrorResult | null
}

type BaseTreeColumn = {
  column: string
  type: Exclude<string, "TIMESTAMP" | "SYMBOL">
}

type TimestampColumn = BaseTreeColumn & {
  designated: boolean
  type: "TIMESTAMP"
}

type SymbolColumn = BaseTreeColumn & {
  symbolCached: boolean
  symbolCapacity: number
  indexed: boolean
  type: "SYMBOL"
}

export type TreeColumn = TimestampColumn | SymbolColumn | BaseTreeColumn

export type FlattenedTreeItem = {
  id: string
  kind: TreeNodeKind
  name: string
  value?: string
  table?: QuestDB.Table
  column?: TreeColumn
  matViewData?: QuestDB.MaterializedView
  viewData?: QuestDB.View
  walTableData?: QuestDB.WalTable
  parent?: string
  isExpanded?: boolean
  isLoading?: boolean
  designatedTimestamp?: string
  partitionBy?: PartitionBy
  walEnabled?: boolean
  type?: string
}

export type TreeNode = FlattenedTreeItem & {
  children: TreeNode[]
}

export type TreeNavigationOptions =
  | { to: "start" }
  | { to: "end" }
  | { to: "next"; id: string }
  | { to: "previous"; id: string }
  | { to: "parent"; id: string }
  | { to: "pageUp" }
  | { to: "pageDown" }

export type SchemaTree = {
  [key: string]: TreeNode
}

const SectionHeader = styled(Row)<{ $disabled: boolean }>`
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "default")};
  pointer-events: ${({ $disabled }) => ($disabled ? "none" : "auto")};

  ${({ $disabled }) =>
    $disabled &&
    `
    opacity: 0.5;
  `}
`

const TableRow = styled(Row)<{ $contextMenuOpen: boolean }>`
  ${({ $contextMenuOpen, theme }) =>
    $contextMenuOpen &&
    `
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

export const getTableKindLabel = (kind: "table" | "matview" | "view") => {
  switch (kind) {
    case "table":
      return "Table"
    case "matview":
      return "Materialized view"
    case "view":
      return "View"
    default:
      return ""
  }
}

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
  views,
  filterSuspendedOnly,
  state,
  loadingError,
}) => {
  const { query, focusedIndex, setFocusedIndex } = useSchema()
  const { quest } = useContext(QuestContext)
  const allColumns = useSelector(selectors.query.getColumns)
  const {
    status: aiStatus,
    setStatus,
    abortController,
    canUse,
    hasSchemaAccess,
    currentModel,
    apiKey,
    isConfigured,
  } = useAIStatus()

  const {
    findConversationByTableId,
    createConversation,
    openChatWindow,
    addMessage,
    updateMessage,
    updateConversationName,
    persistMessages,
  } = useAIConversation()

  const [schemaTree, setSchemaTree] = useState<SchemaTree>({})
  const [openedContextMenu, setOpenedContextMenu] = useState<string | null>(
    null,
  )
  const [openedSuspensionDialog, setOpenedSuspensionDialog] = useState<
    string | null
  >(null)

  const symbolColumnDetailsRef = useRef<Map<string, SymbolColumnDetails>>(
    new Map(),
  )
  const fetchedSymbolsRef = useRef<Set<string>>(new Set())
  const schemaTreeRef = useRef<SchemaTree>(schemaTree)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const rangeRef = useRef<ListRange | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  useRetainLastFocus({ virtuosoRef, focusedIndex, setFocusedIndex, wrapperRef })

  const [regularTables, matViewTables, viewTables] = useMemo(() => {
    return tables
      .reduce(
        (acc, table: QuestDB.Table) => {
          const normalizedTableName = table.table_name.toLowerCase()
          const normalizedQuery = query.toLowerCase()
          const tableNameMatches = normalizedTableName.includes(normalizedQuery)
          const columnMatches =
            !!query &&
            !!allColumns[table.table_name]?.some((col) =>
              col.column_name.toLowerCase().includes(normalizedQuery),
            )
          const shownIfFilteredSuspendedOnly = filterSuspendedOnly
            ? table.walEnabled &&
              walTables?.find((t) => t.name === table.table_name)?.suspended
            : true
          const shownIfFilteredWithQuery = tableNameMatches || columnMatches

          if (shownIfFilteredSuspendedOnly && shownIfFilteredWithQuery) {
            // Use table_type to categorize: 'T' = table, 'M' = matview, 'V' = view
            // Default to 'T' (table) for backward compatibility with older servers
            const tableType =
              (table.table_type as "T" | "M" | "V" | undefined) ?? "T"
            const categoryIndex =
              tableType === "M" ? 1 : tableType === "V" ? 2 : 0
            acc[categoryIndex].push({
              ...table,
              hasColumnMatches: columnMatches,
            })
            return acc
          }
          return acc
        },
        [[], [], []] as (QuestDB.Table & { hasColumnMatches: boolean })[][],
      )
      .map((tables) =>
        tables.sort((a, b) =>
          a.table_name.toLowerCase().localeCompare(b.table_name.toLowerCase()),
        ),
      )
  }, [tables, query, filterSuspendedOnly, walTables, allColumns])

  const flattenedItems = useMemo(() => {
    return Object.values(schemaTree).reduce((acc, node) => {
      acc.push(...flattenTree(node))
      return acc
    }, [] as FlattenedTreeItem[])
  }, [schemaTree])

  const getTableSchema = async (
    tableName: string,
    kind: "table" | "matview" | "view",
  ): Promise<string | null> => {
    try {
      const response =
        kind === "matview"
          ? await quest.showMatViewDDL(tableName)
          : kind === "view"
            ? await quest.showViewDDL(tableName)
            : await quest.showTableDDL(tableName)

      if (response?.type === QuestDB.Type.DQL && response.data?.[0]?.ddl) {
        return response.data[0].ddl
      }
    } catch (_error) {
      const kindLabel =
        kind === "matview"
          ? "materialized view"
          : kind === "view"
            ? "view"
            : "table"
      toast.error(`Cannot fetch schema for ${kindLabel} '${tableName}'`)
    }
    return null
  }

  const handleCopyQuery = async (
    tableName: string,
    kind: "table" | "matview" | "view",
  ) => {
    const schema = await getTableSchema(tableName, kind)
    if (schema) {
      await copyToClipboard(schema)
      toast.success("Schema copied to clipboard")
    }
  }

  const handleExplainSchema = async (item: FlattenedTreeItem) => {
    const tableName = item.name
    const kind = item.kind as "table" | "matview" | "view"
    const tableId = item.table?.id

    if (!canUse) {
      toast.error(
        "AI Assistant is not enabled. Please configure your API key in settings.",
      )
      return
    }

    if (tableId == null) {
      toast.error("Cannot find table ID")
      return
    }

    const schema = await getTableSchema(tableName, kind)
    if (!schema) {
      return
    }

    const existingConversation = findConversationByTableId(tableId)
    if (existingConversation) {
      void openChatWindow(existingConversation.id)
      return
    }

    const conversation = await createConversation({
      tableId,
    })

    void updateConversationName(
      conversation.id,
      `${tableName} schema explanation`,
    )
    const userMessage = getExplainSchemaPrompt(
      tableName,
      schema,
      getTableKindLabel(kind),
    )
    await openChatWindow(conversation.id)

    addMessage({
      role: "user",
      content: userMessage,
      timestamp: Date.now(),
      displayType: "schema_explain_request",
      displaySchemaData: {
        tableName,
        kind,
        partitionBy: item.partitionBy,
        walEnabled: item.walEnabled,
        designatedTimestamp: item.designatedTimestamp,
      },
    })

    const assistantMessageId = crypto.randomUUID()
    addMessage({
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      operationHistory: [],
    })

    const provider = providerForModel(currentModel)

    const settings: ActiveProviderSettings = {
      model: currentModel,
      provider,
      apiKey,
    }

    const handleStatusUpdate = (history: OperationHistory) => {
      updateMessage(conversation.id, assistantMessageId, {
        operationHistory: [...history],
      })
    }

    const response = await explainTableSchema({
      tableName,
      schema,
      kindLabel: getTableKindLabel(kind),
      settings,
      setStatus: (status: AIOperationStatus | null, args?: StatusArgs) =>
        setStatus(
          status,
          { ...(args ?? {}), conversationId: conversation.id },
          handleStatusUpdate,
        ),
      abortSignal: abortController?.signal,
    })

    if (isAiAssistantError(response)) {
      const error = response
      updateMessage(conversation.id, assistantMessageId, {
        error:
          error.type !== "aborted"
            ? error.message
            : "Operation has been cancelled",
      })
      await persistMessages(conversation.id)
      return
    }

    const result = response
    if (!result.explanation) {
      toast.error("No explanation received from AI Assistant", {
        autoClose: 10000,
      })
      return
    }

    const markdownContent = schemaExplanationToMarkdown(result)
    updateMessage(conversation.id, assistantMessageId, {
      content: markdownContent,
      explanation: markdownContent,
      tokenUsage: result.tokenUsage,
    })

    await persistMessages(conversation.id)
  }

  const fetchSymbolColumnDetails = useCallback(
    async (
      tableName: string,
      columnName: string,
    ): Promise<SymbolColumnDetails | null> => {
      try {
        const response = await quest.showSymbolColumnDetails(
          tableName,
          columnName,
        )
        if (
          response &&
          response.type === QuestDB.Type.DQL &&
          response.data.length > 0
        ) {
          return response.data[0]
        }
      } catch (error) {
        toast.error(
          `Cannot fetch column details from table '${tableName}' for column ${columnName}`,
        )
      }
      return null
    },
    [quest],
  )

  const getOrFetchSymbolDetails = useCallback(
    async (
      id: string,
      tableName: string,
      columnName: string,
    ): Promise<TreeNode[]> => {
      fetchedSymbolsRef.current.add(id)
      const cached = symbolColumnDetailsRef.current.get(id)
      if (cached) {
        return createSymbolDetailsNodes(cached, id)
      }

      const details = await fetchSymbolColumnDetails(tableName, columnName)
      if (details) {
        symbolColumnDetailsRef.current.set(id, details)
        return createSymbolDetailsNodes(details, id)
      }

      return []
    },
    [fetchSymbolColumnDetails],
  )

  const toggleNodeExpansion = useCallback(
    (id: string) => {
      const isExpanded = getSectionExpanded(id)
      const willBeExpanded = !isExpanded

      let newTree = { ...schemaTree }
      const modifiedKeys = setSectionExpanded(id, willBeExpanded)
      modifiedKeys.forEach((key) => {
        newTree = updateAndGetSchemaTree(newTree, key, (node) => ({
          ...node,
          isExpanded: willBeExpanded,
        }))
      })

      const splittedId = id.split(":")
      const isColumnDetail =
        splittedId.length > 2 && splittedId.slice(-2)[0] === "columns"

      if (isColumnDetail) {
        let children: TreeNode[]
        if (!willBeExpanded) {
          fetchedSymbolsRef.current.delete(id)
          children = []
        } else {
          children = createSymbolDetailsPlaceholderNodes(id)
        }
        newTree = updateAndGetSchemaTree(newTree, id, (node) => ({
          ...node,
          children,
        }))
      }
      setSchemaTree(newTree)
    },
    [schemaTree],
  )

  const navigateInTree = useCallback(
    (options: TreeNavigationOptions) => {
      if (!virtuosoRef.current) {
        return
      }
      const { to } = options

      switch (to) {
        case "start":
          virtuosoRef.current.scrollIntoView({
            index: 0,
            align: "start",
            done: () => setFocusedIndex(0),
          })
          break
        case "end":
          virtuosoRef.current.scrollIntoView({
            index: flattenedItems.length - 1,
            align: "end",
            done: () => setFocusedIndex(flattenedItems.length - 1),
          })
          break
        case "next": {
          const { id: elementId } = options
          const nextIndex = Math.min(
            flattenedItems.length - 1,
            findRowIndexById(flattenedItems, elementId) + 1,
          )
          virtuosoRef.current.scrollIntoView({
            index: nextIndex,
            done: () => setFocusedIndex(nextIndex),
          })
          break
        }
        case "previous": {
          const { id } = options
          const prevIndex = Math.max(
            0,
            findRowIndexById(flattenedItems, id) - 1,
          )
          virtuosoRef.current.scrollIntoView({
            index: prevIndex,
            done: () => setFocusedIndex(prevIndex),
          })
          break
        }
        case "parent": {
          const { id: childId } = options
          const parentId = childId.split(":").slice(0, -1).join(":")
          const parentIndex = findRowIndexById(flattenedItems, parentId)
          if (parentIndex !== -1) {
            virtuosoRef.current.scrollIntoView({
              index: parentIndex,
              done: () => setFocusedIndex(parentIndex),
            })
          }
          break
        }
        case "pageUp": {
          if (!rangeRef.current) return
          const { startIndex: upStart, endIndex: upEnd } = rangeRef.current
          const upRangeLength = upEnd - upStart
          const upIndex =
            focusedIndex !== -1 && focusedIndex !== upStart
              ? upStart
              : Math.max(0, upStart - upRangeLength)
          virtuosoRef.current.scrollIntoView({
            index: upIndex,
            align: "start",
            done: () => setFocusedIndex(upIndex),
          })
          break
        }
        case "pageDown": {
          if (!rangeRef.current) return
          const { startIndex: downStart, endIndex: downEnd } = rangeRef.current
          const downRangeLength = downEnd - downStart
          const downIndex =
            focusedIndex !== -1 && focusedIndex !== downEnd
              ? downEnd
              : Math.min(flattenedItems.length - 1, downEnd + downRangeLength)
          virtuosoRef.current.scrollIntoView({
            index: downIndex,
            align: "end",
            done: () => setFocusedIndex(downIndex),
          })
          break
        }
        default:
          break
      }
    },
    [flattenedItems, virtuosoRef, rangeRef, focusedIndex, setFocusedIndex],
  )

  const renderRow = useCallback(
    (index: number) => {
      const item = flattenedItems[index]

      if (
        item.kind === "column" &&
        item.isExpanded &&
        item.type === "SYMBOL" &&
        !fetchedSymbolsRef.current.has(item.id)
      ) {
        const result = getNodeFromSchemaTree(schemaTreeRef.current, item.id)
        if (result) {
          const isLoading = result.node.children.some(
            (child) => child.isLoading,
          )
          if (isLoading) {
            const splittedId = item.id.split(":")
            const columnName = splittedId.slice(-1)[0]
            const tableName = splittedId.slice(-3)[0]

            void getOrFetchSymbolDetails(item.id, tableName, columnName).then(
              (children) => {
                setSchemaTree((currentTree) =>
                  updateAndGetSchemaTree(currentTree, item.id, (node) => ({
                    ...node,
                    children,
                  })),
                )
              },
            )
          }
        }
      }

      if (item.kind === "detail") {
        return (
          <Row
            kind="detail"
            index={index}
            name={item.value ? `${item.name}:` : item.name}
            value={item.value}
            isLoading={item.isLoading}
            id={item.id}
            onExpandCollapse={() => {}}
            navigateInTree={navigateInTree}
          />
        )
      }

      if (
        item.id === TABLES_GROUP_KEY ||
        item.id === MATVIEWS_GROUP_KEY ||
        item.id === VIEWS_GROUP_KEY
      ) {
        const isTable = item.id === TABLES_GROUP_KEY
        const isMatView = item.id === MATVIEWS_GROUP_KEY
        const isEmpty = isTable
          ? regularTables.length === 0
          : isMatView
            ? matViewTables.length === 0
            : viewTables.length === 0
        const hookLabel = isTable
          ? "tables"
          : isMatView
            ? "materialized-views"
            : "views"
        return (
          <SectionHeader
            $disabled={isEmpty}
            name={item.name}
            kind="folder"
            index={index}
            expanded={item.isExpanded}
            data-hook={`${item.isExpanded ? "collapse" : "expand"}-${hookLabel}`}
            onExpandCollapse={() => toggleNodeExpansion(item.id)}
            id={item.id}
            navigateInTree={navigateInTree}
          />
        )
      }

      if (item.kind === "folder") {
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
        )
      }

      if (
        item.kind === "table" ||
        item.kind === "matview" ||
        item.kind === "view"
      ) {
        const canSuspend = item.kind !== "view" // Views cannot be suspended
        return (
          <>
            <ContextMenu
              onOpenChange={(open) =>
                setOpenedContextMenu(open ? item.id : null)
              }
            >
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
                      ...(item.matViewData?.view_status === "invalid"
                        ? [
                            `Materialized view is invalid${item.matViewData?.invalidation_reason && `: ${item.matViewData?.invalidation_reason}`}`,
                          ]
                        : []),
                      ...(item.viewData?.view_status === "invalid"
                        ? [
                            `View is invalid${item.viewData?.invalidation_reason && `: ${item.viewData?.invalidation_reason}`}`,
                          ]
                        : []),
                      ...(item.walTableData?.suspended ? [`Suspended`] : []),
                    ]}
                  />
                  {canSuspend && item.walTableData?.suspended && (
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
                  onClick={async () =>
                    await handleCopyQuery(
                      item.name,
                      item.kind as "table" | "matview" | "view",
                    )
                  }
                  icon={<FileCopy size={16} />}
                >
                  Copy schema
                </MenuItem>
                {isConfigured && (
                  <MenuItem
                    data-hook="table-context-menu-explain-schema"
                    onClick={async () => await handleExplainSchema(item)}
                    icon={<AISparkle size={16} variant="filled" inverted />}
                    disabled={
                      !canUse ||
                      !hasSchemaAccess ||
                      isBlockingAIStatus(aiStatus)
                    }
                  >
                    Explain schema with AI
                  </MenuItem>
                )}
                {canSuspend && (
                  <MenuItem
                    data-hook="table-context-menu-resume-wal"
                    onClick={() =>
                      item.walTableData?.suspended &&
                      setTimeout(() => setOpenedSuspensionDialog(item.id))
                    }
                    icon={<Restart size={16} />}
                    disabled={!item.walTableData?.suspended}
                  >
                    Resume WAL
                  </MenuItem>
                )}
              </ContextMenuContent>
            </ContextMenu>
          </>
        )
      }

      if (item.kind === "column") {
        return (
          <Row
            kind="column"
            name={item.name}
            index={index}
            expanded={item.isExpanded}
            onExpandCollapse={() => toggleNodeExpansion(item.id)}
            designatedTimestamp={item.designatedTimestamp}
            type={item.type}
            isLoading={item.isLoading}
            id={item.id}
            navigateInTree={navigateInTree}
          />
        )
      }

      return null
    },
    [
      flattenedItems,
      regularTables,
      matViewTables,
      viewTables,
      toggleNodeExpansion,
      openedContextMenu,
      openedSuspensionDialog,
      navigateInTree,
      getOrFetchSymbolDetails,
    ],
  )

  useEffect(() => {
    if (state.view === View.ready) {
      const newTree: SchemaTree = {
        [TABLES_GROUP_KEY]: {
          id: TABLES_GROUP_KEY,
          kind: "folder",
          name: `Tables (${regularTables.length})`,
          isExpanded:
            regularTables.length === 0
              ? false
              : getSectionExpanded(TABLES_GROUP_KEY),
          children: regularTables.map((table) => {
            const node = createTableNode(
              table,
              TABLES_GROUP_KEY,
              false,
              false,
              materializedViews,
              views,
              walTables,
              allColumns[table.table_name] ?? [],
            )
            if (table.hasColumnMatches) {
              node.isExpanded = true
              // Also mark the columns folder as expanded (but not persisted)
              const columnsFolder = node.children.find((child) =>
                child.id.endsWith(":columns"),
              )
              if (columnsFolder) {
                columnsFolder.isExpanded = true
              }
            }
            return node
          }),
        },
        [MATVIEWS_GROUP_KEY]: {
          id: MATVIEWS_GROUP_KEY,
          kind: "folder",
          name: `Materialized views (${matViewTables.length})`,
          isExpanded:
            matViewTables.length === 0
              ? false
              : getSectionExpanded(MATVIEWS_GROUP_KEY),
          children: matViewTables.map((table) => {
            const node = createTableNode(
              table,
              MATVIEWS_GROUP_KEY,
              true,
              false,
              materializedViews,
              views,
              walTables,
              allColumns[table.table_name] ?? [],
            )
            if (table.hasColumnMatches) {
              node.isExpanded = true
              const columnsFolder = node.children.find((child) =>
                child.id.endsWith(":columns"),
              )
              if (columnsFolder) {
                columnsFolder.isExpanded = true
              }
            }
            return node
          }),
        },
        [VIEWS_GROUP_KEY]: {
          id: VIEWS_GROUP_KEY,
          kind: "folder",
          name: `Views (${viewTables.length})`,
          isExpanded:
            viewTables.length === 0
              ? false
              : getSectionExpanded(VIEWS_GROUP_KEY),
          children: viewTables.map((table) => {
            const node = createTableNode(
              table,
              VIEWS_GROUP_KEY,
              false,
              true,
              materializedViews,
              views,
              walTables,
              allColumns[table.table_name] ?? [],
            )
            if (table.hasColumnMatches) {
              node.isExpanded = true
              const columnsFolder = node.children.find((child) =>
                child.id.endsWith(":columns"),
              )
              if (columnsFolder) {
                columnsFolder.isExpanded = true
              }
            }
            return node
          }),
        },
      }

      fetchedSymbolsRef.current.clear()
      setSchemaTree(newTree)
    }
  }, [
    state.view,
    regularTables,
    matViewTables,
    viewTables,
    materializedViews,
    views,
    walTables,
    allColumns,
  ])

  useEffect(() => {
    symbolColumnDetailsRef.current.clear()
    fetchedSymbolsRef.current.clear()
  }, [allColumns])

  useEffect(() => {
    schemaTreeRef.current = schemaTree
  }, [schemaTree])

  if (state.view === View.loading) {
    return <Loading />
  }

  if (state.view === View.error) {
    return loadingError ? <LoadingError error={loadingError} /> : <FlexSpacer />
  }

  return (
    <>
      <div ref={wrapperRef} style={{ height: "100%" }}>
        <Virtuoso
          totalCount={flattenedItems.length}
          ref={virtuosoRef}
          data-hook="schema-tree"
          rangeChanged={(newRange) => {
            rangeRef.current = newRange
          }}
          data={flattenedItems}
          itemContent={(index) => renderRow(index)}
          style={{ height: "100%" }}
        />
      </div>
    </>
  )
}

export default VirtualTables
