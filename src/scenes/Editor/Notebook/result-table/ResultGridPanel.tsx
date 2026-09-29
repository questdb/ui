import React, { useCallback, useMemo, useRef, useState } from "react"
import { queryKeyFor } from "../queryKey"
import {
  ResultGrid,
  inMemoryDataSource,
  type ResultGridHandle,
  type ResultGridViewport,
} from "../../../../components/ResultGrid"
import type { DqlQueryResult } from "../../../../store/notebook"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import {
  loadNotebookColumnLayout,
  saveNotebookColumnLayout,
  removeNotebookColumnLayout,
} from "../notebookColumnLayoutStore"
import { ResultActionsBar } from "./ResultActionsBar"
import { HighlightSettingsDrawer } from "../CellHighlight/HighlightSettingsDrawer"
import { highlightSettingsSessions } from "../settingsDrawer/settingsDrawerSessions"
import { useSettingsDrawerSession } from "../settingsDrawer/useSettingsDrawerSession"
import type { SettingsDismissMethod } from "../settingsDrawer/SettingsDrawerShell"
import { useNotebookActions } from "../NotebookProvider"
import { signalUserEdit } from "../../../../utils/notebooks/notebookAIBridge"
import { EventType } from "../../../../modules/EventBus/types"
import type { ResultGridViewportStore } from "./resultGridViewportStore"
import { useResultTrendStore } from "./ResultTrendContext"
import { resolveHighlightConfig } from "./highlightConfig"
import {
  columnRangeOf,
  duplicateRowCount,
  evaluateHighlights,
  useRe2Ready,
  usesPatterns,
  type HighlightConfig,
} from "../../../../components/ResultGrid/highlight"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import { useLocalStorage } from "../../../../providers/LocalStorageProvider"

type Props = {
  data: DqlQueryResult
  // Statement identity for the viewport store and the re-run action. The
  // column layout stays keyed by query text alone — duplicate statements
  // share identical columns.
  statementKey: string
  runToken: number
  isFocused: boolean
  bufferId: number
  cellId: string
  isRunning: boolean
  onReRun: (statementKey: string) => void
  onYieldFocus: () => void
  viewportStore: ResultGridViewportStore
  highlightConfig: HighlightConfig | undefined
  // Every column any result of the cell has, for the rule pickers.
  cellColumns: ColumnDefinition[]
}

const trackHighlightOpen = () =>
  void trackEvent(ConsoleEvent.GRID_HIGHLIGHT_OPEN, { source: "notebook" })

const trackHighlightCancel = (method: SettingsDismissMethod) =>
  void trackEvent(ConsoleEvent.GRID_HIGHLIGHT_CANCEL, {
    source: "notebook",
    method,
  })

const useInitialGridState = ({
  bufferId,
  cellId,
  data,
  statementKey,
  runToken,
  viewportStore,
}: Pick<
  Props,
  "bufferId" | "cellId" | "data" | "statementKey" | "runToken" | "viewportStore"
>) =>
  useMemo(() => {
    const queryKey = queryKeyFor(data.query)
    return {
      queryKey,
      columnLayout: loadNotebookColumnLayout(bufferId, cellId, queryKey),
      viewport: viewportStore.load(statementKey, runToken),
    }
  }, [bufferId, cellId, data.query, statementKey, runToken, viewportStore])

const ResultGridPanelInner: React.FC<Props> = ({
  data,
  statementKey,
  runToken,
  isFocused,
  bufferId,
  cellId,
  isRunning,
  onReRun,
  onYieldFocus,
  viewportStore,
  highlightConfig: savedHighlightConfig,
  cellColumns,
}) => {
  const { queryKey, columnLayout, viewport } = useInitialGridState({
    bufferId,
    cellId,
    data,
    statementKey,
    runToken,
    viewportStore,
  })
  const { maxColumnWidth } = useLocalStorage()
  const { setCellHighlightConfig } = useNotebookActions()
  const trendStore = useResultTrendStore()
  const highlightDrawer = useSettingsDrawerSession({
    sessions: highlightSettingsSessions,
    cellId,
    config: savedHighlightConfig,
    openEvent: EventType.NOTEBOOK_CELL_OPEN_HIGHLIGHT_SETTINGS,
    onOpen: trackHighlightOpen,
    onCancel: trackHighlightCancel,
    changedWhileOpenMessage:
      "Highlight rules were updated since last check. Reopen highlight rules to edit.",
  })
  const [hasSelection, setHasSelection] = useState(false)
  const [pinnedCount, setPinnedCount] = useState(
    columnLayout?.pinnedColumns?.length ?? 0,
  )
  const gridRef = useRef<ResultGridHandle | null>(null)
  const dataSource = useMemo(
    () => inMemoryDataSource(data.columns, data.dataset, data.timestamp ?? -1),
    [data.columns, data.dataset, data.timestamp],
  )
  const saveViewport = useCallback(
    (nextViewport: ResultGridViewport) =>
      viewportStore.save(statementKey, runToken, nextViewport),
    [viewportStore, statementKey, runToken],
  )
  const highlightConfig = useMemo(
    () => resolveHighlightConfig(savedHighlightConfig, data),
    [savedHighlightConfig, data],
  )
  // Captured when the cells state changed, before this render.
  const trend = trendStore.get(cellId, statementKey)
  const previous = trend?.result === data ? trend.previous : null
  const capturedAt = trend?.capturedAt ?? 0
  const revision = trend?.revision ?? 0
  const columnRange = useMemo(
    () => columnRangeOf(data.columns, data.dataset),
    [data],
  )
  const duplicateCountOf = useCallback(
    (identityColumns: string[]) =>
      duplicateRowCount(data.columns, data.dataset, identityColumns),
    [data],
  )
  // Pattern rules match nothing until RE2 has loaded, then evaluate again.
  const re2Ready = useRe2Ready(usesPatterns(highlightConfig))
  const highlights = useMemo(
    () =>
      evaluateHighlights({
        columns: data.columns,
        dataset: data.dataset,
        config: highlightConfig,
        previous,
      }),
    [data, highlightConfig, previous, re2Ready],
  )

  const saveHighlight = (next: typeof highlightConfig) => {
    void trackEvent(ConsoleEvent.GRID_HIGHLIGHT_SAVE, {
      source: "notebook",
      ruleCount: next.rules.length,
      kinds: next.rules.map((rule) => rule.kind),
    })
    signalUserEdit(bufferId)
    setCellHighlightConfig(cellId, next)
    highlightDrawer.close()
  }

  const clearHighlight = () => {
    void trackEvent(ConsoleEvent.GRID_HIGHLIGHT_CLEAR, { source: "notebook" })
    signalUserEdit(bufferId)
    setCellHighlightConfig(cellId, null)
    highlightDrawer.close()
  }

  return (
    <>
      <ResultActionsBar
        data={data}
        gridRef={gridRef}
        isFrozen={pinnedCount > 0}
        hasSelection={hasSelection}
        isRunning={isRunning}
        onReRun={() => onReRun(statementKey)}
      />
      <ResultGrid
        ref={gridRef}
        dataSource={dataSource}
        maxColumnWidth={maxColumnWidth}
        runToken={runToken}
        cellHighlights={highlights.lookup}
        flashParity={revision % 2 === 0 ? 0 : 1}
        flashStartedAt={capturedAt}
        isFocused={isFocused}
        initialColumnSizing={columnLayout?.columnSizing}
        initialColumnOrder={columnLayout?.columnOrder}
        initialPinnedColumns={columnLayout?.pinnedColumns}
        initialViewport={viewport ?? undefined}
        onViewportSave={saveViewport}
        onColumnSizingCommit={(sizing) =>
          saveNotebookColumnLayout(bufferId, cellId, queryKey, {
            columnSizing: sizing,
          })
        }
        onColumnOrderCommit={(order) =>
          saveNotebookColumnLayout(bufferId, cellId, queryKey, {
            columnOrder: order,
          })
        }
        onPinnedColumnsCommit={(pinned) => {
          saveNotebookColumnLayout(bufferId, cellId, queryKey, {
            pinnedColumns: pinned,
          })
          setPinnedCount(pinned.length)
        }}
        onResetLayout={() =>
          removeNotebookColumnLayout(bufferId, cellId, queryKey)
        }
        onSelectionChange={setHasSelection}
        onYieldFocus={onYieldFocus}
        onCellCopy={() =>
          void trackEvent(ConsoleEvent.GRID_CELL_COPY, { source: "notebook" })
        }
        onColumnCopy={() =>
          void trackEvent(ConsoleEvent.GRID_COLUMN_COPY, {
            source: "notebook",
          })
        }
      />
      <HighlightSettingsDrawer
        key={highlightDrawer.generation}
        open={highlightDrawer.open}
        appearInPlace={highlightDrawer.appearInPlace}
        initialDraft={highlightDrawer.initialDraft}
        onDraftChange={highlightDrawer.keepDraft}
        columns={cellColumns}
        columnRange={columnRange}
        config={highlightConfig}
        duplicateCountOf={duplicateCountOf}
        onSave={saveHighlight}
        onClear={clearHighlight}
        onCancel={highlightDrawer.cancel}
      />
    </>
  )
}

export const ResultGridPanel = React.memo(ResultGridPanelInner)
