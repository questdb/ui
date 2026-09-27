import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import type { HighlightDraft } from "../CellHighlight/ruleDraft"
import { highlightSettingsSessions } from "../settingsDrawer/settingsDrawerSessions"
import { useNotebookActions } from "../NotebookProvider"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import type { ResultGridViewportStore } from "./resultGridViewportStore"
import { FLASH_DURATION_MS } from "./resultTrendStore"
import { useResultTrendStore } from "./ResultTrendContext"
import { resolveHighlightConfig } from "./highlightConfig"
import {
  columnRangeOf,
  evaluateHighlights,
  type HighlightConfig,
  type HighlightLookup,
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

// A remount after the flash window must not replay old flashes; the direction
// glyph stays until the next comparison.
const withoutExpiredFlashes = (
  lookup: HighlightLookup,
  capturedAt: number,
): HighlightLookup => {
  if (Date.now() - capturedAt < FLASH_DURATION_MS) return lookup
  return {
    ...lookup,
    background: (row, col) => {
      const highlight = lookup.background(row, col)
      return highlight?.display === "temporary" ? undefined : highlight
    },
  }
}

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
  const [hasSelection, setHasSelection] = useState(false)
  const [restoredHighlight] = useState(
    () => highlightSettingsSessions.get(cellId) !== undefined,
  )
  const [highlightOpen, setHighlightOpen] = useState(restoredHighlight)
  const [highlightSession, setHighlightSession] = useState(0)
  const [pinnedCount, setPinnedCount] = useState(
    columnLayout?.pinnedColumns?.length ?? 0,
  )
  const gridRef = useRef<ResultGridHandle | null>(null)
  const dataSource = useMemo(
    () => inMemoryDataSource(data.columns, data.dataset, data.timestamp ?? -1),
    [data],
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
  const highlights = useMemo(() => {
    const { lookup, stats } = evaluateHighlights({
      columns: data.columns,
      dataset: data.dataset,
      config: highlightConfig,
      previous,
    })
    return { lookup: withoutExpiredFlashes(lookup, capturedAt), stats }
  }, [data, highlightConfig, previous, capturedAt])

  const openHighlight = useCallback(() => {
    void trackEvent(ConsoleEvent.GRID_HIGHLIGHT_OPEN, { source: "notebook" })
    highlightSettingsSessions.set(cellId, { draft: null })
    setHighlightSession((session) => session + 1)
    setHighlightOpen(true)
  }, [cellId])

  const closeHighlight = useCallback(() => {
    highlightSettingsSessions.clear(cellId)
    setHighlightOpen(false)
  }, [cellId])

  const keepHighlightDraft = useCallback(
    (draft: HighlightDraft) =>
      highlightSettingsSessions.update(cellId, { draft }),
    [cellId],
  )

  const saveHighlight = (next: typeof highlightConfig) => {
    void trackEvent(ConsoleEvent.GRID_HIGHLIGHT_SAVE, {
      source: "notebook",
      ruleCount: next.rules.length,
      kinds: next.rules.map((rule) => rule.kind),
    })
    setCellHighlightConfig(cellId, next)
    closeHighlight()
  }

  const clearHighlight = () => {
    void trackEvent(ConsoleEvent.GRID_HIGHLIGHT_CLEAR, { source: "notebook" })
    setCellHighlightConfig(cellId, null)
    closeHighlight()
  }

  const cancelHighlight = useCallback(
    (method: string) => {
      void trackEvent(ConsoleEvent.GRID_HIGHLIGHT_CANCEL, {
        source: "notebook",
        method,
      })
      closeHighlight()
    },
    [closeHighlight],
  )

  // The spotlight gear and the kebab entry send the same event; while the
  // drawer is open it acts as a toggle instead of remounting the draft.
  useEffect(() => {
    const toggle = (payload?: { cellId?: string }) => {
      if (payload?.cellId !== cellId) return
      if (highlightOpen) cancelHighlight("button")
      else openHighlight()
    }
    eventBus.subscribe(EventType.NOTEBOOK_CELL_OPEN_HIGHLIGHT_SETTINGS, toggle)
    return () =>
      eventBus.unsubscribe(
        EventType.NOTEBOOK_CELL_OPEN_HIGHLIGHT_SETTINGS,
        toggle,
      )
  }, [cellId, highlightOpen, openHighlight, cancelHighlight])

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
        key={highlightSession}
        open={highlightOpen}
        appearInPlace={restoredHighlight && highlightSession === 0}
        initialDraft={highlightSettingsSessions.get(cellId)?.draft ?? null}
        onDraftChange={keepHighlightDraft}
        columns={cellColumns}
        columnRange={columnRange}
        config={highlightConfig}
        stats={highlights.stats}
        onSave={saveHighlight}
        onClear={clearHighlight}
        onCancel={cancelHighlight}
      />
    </>
  )
}

export const ResultGridPanel = React.memo(ResultGridPanelInner)
