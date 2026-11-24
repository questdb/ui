import React, { useCallback, useEffect, useMemo, useRef } from "react"
import styled, { useTheme } from "styled-components"
import type { EChartsType } from "echarts"
import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import type { NotebookCell } from "../../../../store/notebook"
import type { ChartConfig } from "../CellChart/chartTypes"
import { chartSettingsSessions } from "../settingsDrawer/settingsDrawerSessions"
import { useSettingsDrawerSession } from "../settingsDrawer/useSettingsDrawerSession"
import type { SettingsDismissMethod } from "../settingsDrawer/SettingsDrawerShell"
import { DrawSettingsDrawer } from "../CellChart/DrawSettingsDrawer"
import { sameDrawSettings, type DrawSettings } from "../CellChart/drawSettings"
import { resolveDraw, toChartResult } from "./drawCanvasUtils"
import { presetDraw } from "./presetOutcome"
import { Button } from "../../../../components/Button"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import {
  shallowEqual,
  useCellFetchSelector,
} from "../cellRefresh/CellRefreshContext"
import {
  fetchStateIsFor,
  pendingCellFetchState,
  type CellFetchState,
} from "../cellRefresh/cellRefreshEngine"
import { useChartLoading } from "../cells/useChartLoading"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import type { ChartSettingsTelemetry } from "../CellChart/chartSettingsTelemetry"
import { signalUserEdit } from "../../../../utils/notebooks/notebookAIBridge"
import {
  useNotebookActions,
  useNotebookBufferId,
  useNotebookSettings,
} from "../NotebookProvider"
import { statementResultsOf } from "../visuals/statementRows"
import {
  ChartSuspense,
  LazyChartRenderer,
  LazyCustomChart,
  LazyVisualCanvas,
  preloadChartCode,
} from "../CellChart/lazyCharts"
import { armBrush, interactionEvents } from "../interactions/chartInteractions"
import { joinChartSync, setChartSync } from "../interactions/chartSync"
import { fetchOutcome, useReportOutcome } from "../drawOutcome"
import { DrawOutcomePane, VisuallyHiddenStatus } from "../DrawOutcomePane"
import { registerCellChart } from "../cellChartImages"
import { PaneEmptyState } from "../PaneEmptyState"
import { withNewVariables } from "../interactions/InteractionsEditor"
import { normalizeVariables } from "../declareUtils"
import type { NotebookVariable } from "../../../../store/notebook"

const NO_RESULTS: QueryExecResult[] = []

const MIN_ANIMATED_REFRESH_INTERVAL_MS = 500

const animatesAt = (refreshIntervalMs: number | undefined) =>
  refreshIntervalMs === undefined ||
  refreshIntervalMs >= MIN_ANIMATED_REFRESH_INTERVAL_MS

type DrawState = Pick<
  CellFetchState,
  "queries" | "queriesKey" | "settledKey" | "classifyBlock" | "fetchCancelled"
>

// Leaves out `fetching`: the canvas reads it only through `loading`, so a
// refresh of a drawn chart does not re-render it.
const selectDrawState = (
  state: CellFetchState | undefined,
): DrawState | undefined =>
  state && {
    queries: state.queries,
    queriesKey: state.queriesKey,
    settledKey: state.settledKey,
    classifyBlock: state.classifyBlock,
    fetchCancelled: state.fetchCancelled,
  }

const notebookChartSettingsTelemetry: ChartSettingsTelemetry = {
  onCancel: (method) => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CHART_SETTINGS_CANCEL, { method })
  },
  onSave: (payload) => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CHART_SETTINGS_SAVE, payload)
  },
  onSaveBlocked: (reason) => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CHART_SAVE_BLOCKED, { reason })
  },
  onTypeChange: (from, to) => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CHART_TYPE_CHANGE, { from, to })
  },
  onResetAuto: (chartType) => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CHART_RESET_AUTO, { chartType })
  },
}

const trackChartSettingsCancel = (method: SettingsDismissMethod) =>
  notebookChartSettingsTelemetry.onCancel?.(method)

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  position: relative;
  background: ${({ theme }) => theme.color.surfaceInset};
`

const Canvas = styled.div`
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background: ${({ theme }) => theme.color.surfaceInset};
`

const CancelledState = styled(PaneEmptyState)`
  flex-direction: column;
  gap: 1rem;
`

type Props = {
  cell: NotebookCell
  isFocused: boolean
  refreshIntervalMs: number | undefined
  onSettingsChange: (settings: DrawSettings) => void
  onRetryUnmountWhileFocused: () => void
}

const NO_CHART: ChartConfig = { xColumn: null, queries: [] }

export const DrawCanvas: React.FC<Props> = ({
  cell,
  isFocused,
  refreshIntervalMs,
  onSettingsChange,
  onRetryUnmountWhileFocused,
}) => {
  // What the drawer edits. An open drawer closes when one of these fields
  // changes elsewhere (the assistant), compared field by field so a remount
  // (maximize, restore) keeps the drawer and its draft.
  const savedSettings: DrawSettings = useMemo(
    () => ({
      chartConfig: cell.chartConfig ?? NO_CHART,
      ...(cell.formats ? { formats: cell.formats } : {}),
      ...(cell.interactions ? { interactions: cell.interactions } : {}),
    }),
    [cell.chartConfig, cell.formats, cell.interactions],
  )
  const trackSettingsOpen = useCallback(() => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CHART_SETTINGS_OPEN, {
      chartType: cell.chartConfig?.queries.find((q) => q != null)?.type,
    })
  }, [cell.chartConfig])
  const settingsDrawer = useSettingsDrawerSession({
    sessions: chartSettingsSessions,
    cellId: cell.id,
    config: savedSettings,
    sameConfig: sameDrawSettings,
    openEvent: EventType.NOTEBOOK_CELL_OPEN_CHART_SETTINGS,
    onOpen: trackSettingsOpen,
    onCancel: trackChartSettingsCancel,
    changedWhileOpenMessage:
      "Chart settings were updated by the assistant. Reopen chart configuration to edit.",
  })
  const bufferId = useNotebookBufferId()
  const drawState = useCellFetchSelector(cell.id, selectDrawState, shallowEqual)
  const { loading } = useChartLoading(cell)

  const zoomScope = useMemo(
    () => ({ bufferId, cellId: cell.id }),
    [bufferId, cell.id],
  )

  const state: DrawState = useMemo(
    () => drawState ?? pendingCellFetchState(cell.value),
    [drawState, cell.value],
  )
  const { queries, queriesKey, settledKey, classifyBlock } = state
  const chartResult = useMemo(
    () => toChartResult(cell.result, queries),
    [cell.result, queries],
  )
  const results =
    chartResult.kind === "settled" ? chartResult.results : NO_RESULTS

  const resolution = useMemo(
    () => resolveDraw(queries, results, cell.chartConfig),
    [queries, results, cell.chartConfig],
  )

  // The refresh replaces the cancelled state, and Retry with it; a focused
  // Retry hands its focus on first, like the Stop button does on unmount.
  const handleRetry = (e: React.MouseEvent) => {
    if (e.currentTarget.matches(":focus-visible")) onRetryUnmountWhileFocused()
    signalUserEdit(bufferId)
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_DRAW)
    eventBus.publish(EventType.NOTEBOOK_CELL_REFRESH_CHART, { cellId: cell.id })
  }

  const theme = useTheme()
  const settings = useNotebookSettings()
  const preciseTimePointer = settings.chartSync?.crosshair === "line"
  const sharedTimePointer =
    preciseTimePointer || settings.chartSync?.crosshair === "tooltip"
  const formats = useMemo(() => cell.formats ?? {}, [cell.formats])
  const { setVariableValues, updateSettings, getVariables } =
    useNotebookActions()
  // A save adds the variables the Interactions section created, then the
  // cell's settings.
  const saveSettings = useCallback(
    (next: DrawSettings, newVariables: NotebookVariable[]) => {
      if (newVariables.length > 0)
        updateSettings({
          variables: withNewVariables(
            normalizeVariables(getVariables()),
            newVariables,
          ),
        })
      onSettingsChange(next)
    },
    [updateSettings, getVariables, onSettingsChange],
  )
  const visual = cell.chartConfig?.visual
  const custom = cell.chartConfig?.custom
  const drawKind = visual ? "visual" : custom ? "custom" : "chart"
  // The chart code loads while the query runs, not after it.
  useEffect(() => preloadChartCode(drawKind), [drawKind])
  const statementResults = useMemo(
    () => statementResultsOf(cell.result, queries),
    [cell.result, queries],
  )
  const statements =
    statementResults.kind === "settled" ? statementResults.statements : []
  const statementErrors = useMemo(
    () =>
      statementResults.kind === "settled"
        ? cell.result?.results.map((result) =>
            result.type === "error" ? result.error || "Query failed" : null,
          )
        : undefined,
    [cell.result, statementResults],
  )
  // A preset chart's option and what it shows, from the statements that
  // returned rows (visuals and custom charts derive their own).
  const preset = useMemo(
    () =>
      drawKind === "chart"
        ? presetDraw({
            results,
            error: statementErrors?.find((e): e is string => e !== null),
            resolution,
            config: cell.chartConfig,
            formats,
            context: {
              colors: theme.color,
              clickEnabled: cell.interactions?.click !== undefined,
              preciseTimePointer,
              sharedTimePointer,
            },
            interactions: cell.interactions,
          })
        : null,
    [
      drawKind,
      results,
      statementErrors,
      resolution,
      cell.chartConfig,
      formats,
      theme.color,
      cell.interactions,
      preciseTimePointer,
      sharedTimePointer,
    ],
  )
  const live = !animatesAt(refreshIntervalMs)

  useEffect(() => {
    setChartSync(bufferId, settings.chartSync)
  }, [bufferId, settings.chartSync])

  // Clicks read the rows of the latest settled statements, the ones the chart
  // shows; the handlers stay the same across refreshes, so the chart does not
  // rebind them on every result.
  const statementsRef = useRef(statements)
  useEffect(() => {
    if (statementResults.kind === "settled")
      statementsRef.current = statementResults.statements
  }, [statementResults])
  const events = useMemo(
    () =>
      interactionEvents(
        cell.interactions,
        setVariableValues,
        () => statementsRef.current,
      ),
    [cell.interactions, setVariableValues],
  )
  const leaveSyncRef = useRef<(() => void) | null>(null)
  const handleInstance = useCallback(
    (instance: EChartsType | null) => {
      leaveSyncRef.current?.()
      leaveSyncRef.current = null
      if (!instance) return
      const leaveSync = joinChartSync(bufferId, instance)
      // Agents ask for a picture of the chart (get_cell_image).
      const unregister = registerCellChart(bufferId, cell.id, instance)
      leaveSyncRef.current = () => {
        leaveSync()
        unregister()
      }
    },
    [bufferId, cell.id],
  )
  useEffect(() => () => leaveSyncRef.current?.(), [])
  // A full redraw drops the brush cursor; each draw takes it again.
  const handleDraw = useCallback(
    (instance: EChartsType) => armBrush(instance, cell.interactions),
    [cell.interactions],
  )

  // The engine takes up edited SQL after a short debounce; until then its
  // settled answer is for the old SQL, not for what the cell holds.
  const sqlApplied = useMemo(
    () => fetchStateIsFor(queriesKey, cell.value),
    [queriesKey, cell.value],
  )
  const settledForCurrentSql =
    settledKey === queriesKey && sqlApplied && chartResult.kind === "settled"
  // Rows to draw: a preset chart draws the statements that returned rows; a
  // visual or custom chart every statement that succeeded, rows or none.
  const hasFrame =
    drawKind === "chart"
      ? results.length > 0
      : statementResults.kind === "settled" &&
        statements.some((s) => s !== null)
  const cancelled = state.fetchCancelled && results.length === 0 && !loading
  // The states every kind shares; null once there are settled rows to draw.
  const fetched = useMemo(
    () =>
      fetchOutcome(
        {
          statementCount: queries.length,
          classifyBlock,
          loading,
          cancelled,
          hasFrame,
          settledForCurrentSql,
        },
        visual ? { type: visual.type } : {},
      ),
    [
      queries.length,
      classifyBlock,
      loading,
      cancelled,
      hasFrame,
      settledForCurrentSql,
      visual,
    ],
  )
  // What the pane shows instead of a chart or component, if anything.
  const shown =
    fetched ??
    (preset && preset.outcome.status !== "drawn" ? preset.outcome : null)
  // The report follows the same outcome. Once a visual or custom chart is
  // drawn from settled rows, it reports what it decided itself.
  useReportOutcome(
    bufferId,
    cell.id,
    drawKind,
    fetched ?? preset?.outcome ?? null,
    visual,
  )

  return (
    <Wrapper>
      <VisuallyHiddenStatus role="status">
        {shown && shown.status !== "blocked" && shown.status !== "failed"
          ? shown.message
          : ""}
      </VisuallyHiddenStatus>
      {shown?.status === "cancelled" ? (
        <CancelledState data-hook="draw-canvas-cancelled">
          <span aria-hidden="true">{shown.message}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRetry}
            dataHook="draw-canvas-retry"
          >
            Retry
          </Button>
        </CancelledState>
      ) : shown ? (
        <DrawOutcomePane outcome={shown} announced />
      ) : (
        <Canvas data-hook="draw-canvas">
          <ChartSuspense>
            {visual ? (
              <LazyVisualCanvas
                bufferId={bufferId}
                cellId={cell.id}
                visual={visual}
                statements={statements}
                statementErrors={statementErrors}
                formats={formats}
                interactions={cell.interactions}
                clickVariableValue={
                  settings.variables?.find(
                    (variable) =>
                      variable.name === cell.interactions?.click?.variable,
                  )?.value
                }
                queriesKey={queriesKey}
                setVariables={setVariableValues}
                live={live}
                isFocused={isFocused}
                events={events}
                onInstance={handleInstance}
                onDraw={handleDraw}
              />
            ) : custom ? (
              <LazyCustomChart
                bufferId={bufferId}
                cellId={cell.id}
                rawOption={custom.option}
                statements={statements}
                statementErrors={statementErrors}
                interactions={cell.interactions}
                live={live}
                isFocused={isFocused}
                events={events}
                onInstance={handleInstance}
                onDraw={handleDraw}
              />
            ) : (
              preset && (
                <LazyChartRenderer
                  option={preset.option}
                  zoomScope={zoomScope}
                  isFocused={isFocused}
                  animate={animatesAt(refreshIntervalMs)}
                  events={events}
                  onInstance={handleInstance}
                  onDraw={handleDraw}
                />
              )
            )}
          </ChartSuspense>
        </Canvas>
      )}
      <DrawSettingsDrawer
        open={settingsDrawer.open}
        appearInPlace={settingsDrawer.appearInPlace}
        onClose={settingsDrawer.close}
        initialDraft={settingsDrawer.initialDraft}
        onDraftChange={settingsDrawer.keepDraft}
        tabs={resolution.tabs}
        saved={savedSettings}
        effective={resolution.effectiveConfig}
        statements={statements}
        onSave={saveSettings}
        telemetry={notebookChartSettingsTelemetry}
      />
    </Wrapper>
  )
}
