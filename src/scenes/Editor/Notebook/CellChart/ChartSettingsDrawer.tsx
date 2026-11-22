import React, { useCallback, useEffect, useRef, useState } from "react"
import styled from "styled-components"
import {
  Input,
  SelectMenuControl,
  TabButton,
  Text,
} from "../../../../components"
import {
  type ChartConfig,
  type ChartSettingsDraft,
  type QueryChart,
} from "./chartTypes"
import {
  ReferenceLinesEditor,
  savedReferenceLines,
} from "./ReferenceLinesEditor"
import type { ChartSettingsTelemetry } from "./chartSettingsTelemetry"
import { groupColumns } from "./inferChartConfig"
import {
  chartXAxisOf,
  isNumericHeatmapValue,
  resolveQueryAxes,
  type QueryTab,
} from "../DrawCanvas/drawCanvasUtils"
import {
  Field,
  FieldGroup,
  FieldLabel,
  IncompatibleIcon,
} from "./chartSettingsStyles"
import { QueryControls } from "./QueryControls"
import {
  SettingsDrawerShell,
  type SettingsDismissMethod,
  type SettingsPresentation,
} from "../settingsDrawer/SettingsDrawerShell"

const Row = styled.div`
  display: flex;
  gap: 0.8rem;
  & > * {
    flex: 1 1 0;
    min-width: 0;
  }
`

const Divider = styled.div`
  border-top: 1px solid ${({ theme }) => theme.color.interactionNeutral};
`

const TabStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.interactionNeutral};
`

const Tab = styled(TabButton)`
  && {
    flex: 0 0 auto;
    white-space: nowrap;
    padding: 0.8rem 1.4rem;
    margin-bottom: -1px;
  }
`

const parseBound = (v: string): number | undefined => {
  const n = Number(v)
  return v === "" || !Number.isFinite(n) ? undefined : n
}

const candlestickMissingOhlc = (q: QueryChart | null): boolean => {
  if (!q || q.type !== "candlestick" || q.enabled === false) return false
  const o = q.ohlc
  if (!o || !o.open || !o.high || !o.low || !o.close) return true
  return new Set([o.open, o.high, o.low, o.close]).size !== 4
}

const heatmapIncomplete = (
  q: QueryChart | null,
  placement: { item: QueryTab; ownX: string | null } | undefined,
  value: string | undefined,
): boolean =>
  !!q &&
  q.type === "heatmap" &&
  q.enabled !== false &&
  (!q.partitionByColumn ||
    !value ||
    (placement != null &&
      (!placement.ownX ||
        q.partitionByColumn === placement.ownX ||
        !isNumericHeatmapValue(placement.item.columns, value))))

type SharedProps = {
  tabs: QueryTab[]
  config: ChartConfig
  onSave: (next: ChartConfig) => void
  telemetry?: ChartSettingsTelemetry
}

type SettingsProps = SharedProps & {
  presentation: SettingsPresentation
  open: boolean
  onClose?: () => void
  // Drawer only: a draft carried across a cell remount, where edits go, and
  // whether this mount is that remount.
  initialDraft?: ChartSettingsDraft | null
  onDraftChange?: (draft: ChartSettingsDraft) => void
  appearInPlace?: boolean
}

const ChartSettings: React.FC<SettingsProps> = ({
  presentation,
  open,
  onClose,
  tabs,
  config,
  onSave,
  telemetry,
  initialDraft,
  onDraftChange,
  appearInPlace,
}) => {
  const [draft, setDraft] = useState<ChartSettingsDraft>(initialDraft ?? config)
  const [activeIndex, setActiveIndex] = useState<number>(tabs[0]?.index ?? 0)
  const [saveAttempted, setSaveAttempted] = useState(false)
  // Mounting already open means a remount mid-session: keep the draft.
  const drawerWasOpenRef = useRef(open)

  // Every edit lands in the session store as well, so a cell remount
  // mid-session restores it.
  const updateDraft = useCallback(
    (next: ChartSettingsDraft) => {
      setDraft(next)
      onDraftChange?.(next)
    },
    [onDraftChange],
  )

  const resetDraft = useCallback(() => {
    updateDraft(config)
    setActiveIndex(tabs[0]?.index ?? 0)
    setSaveAttempted(false)
  }, [config, tabs, updateDraft])

  useEffect(() => {
    const drawerIsOpen = presentation === "drawer" && open
    const drawerJustOpened = drawerIsOpen && !drawerWasOpenRef.current
    drawerWasOpenRef.current = drawerIsOpen

    if (drawerJustOpened) {
      resetDraft()
      return
    }

    if (presentation === "panel") {
      updateDraft(config)
      setActiveIndex((current) =>
        tabs.some((tab) => tab.index === current)
          ? current
          : (tabs[0]?.index ?? 0),
      )
      setSaveAttempted(false)
    }
  }, [config, open, presentation, resetDraft, tabs, updateDraft])

  const dismiss = useCallback(
    (method: SettingsDismissMethod) => {
      telemetry?.onCancel?.(method)
      onClose?.()
    },
    [telemetry, onClose],
  )

  const { anchor, xColumn, placements, allowAnchorExclusion } =
    resolveQueryAxes(tabs, draft)
  const active =
    placements.find(({ item }) => item.index === activeIndex) ?? placements[0]
  const activeTab = active?.item
  // With everything excluded, keep X editable for the selected query so it
  // can be configured before it is included again.
  const xTab = anchor ?? activeTab
  const selectedX =
    anchor || !xTab ? xColumn : chartXAxisOf(xTab, draft.xColumn)
  const xGroups = xTab ? groupColumns(xTab.columns) : null
  const xCandidates = xGroups
    ? [...xGroups.temporal, ...xGroups.categorical, ...xGroups.numeric]
    : []
  const isAnchorTab = activeTab != null && activeTab === anchor
  const query = activeTab != null ? draft.queries[activeTab.index] : null

  const includedTabs = placements.filter(({ included }) => included)
  const heatmapConflict =
    includedTabs.length > 1 &&
    includedTabs.some(
      ({ item }) => draft.queries[item.index]?.type === "heatmap",
    )
  const hasRight = draft.queries.some((q) => q?.axis === "right")
  const primary = anchor
    ? (draft.queries[anchor.index] ?? anchor.inferredChart)
    : null
  // Pie and heatmap charts have no value axis to draw a line on.
  const hasValueAxis =
    primary != null &&
    primary.type !== "pie" &&
    primary.type !== "heatmap" &&
    !heatmapConflict

  const updateQuery = (index: number, patch: Partial<QueryChart>) =>
    updateDraft({
      ...draft,
      queries: draft.queries.map((q, i) =>
        i === index && q ? { ...q, ...patch } : q,
      ),
    })

  const changeXColumn = (xColumn: string | null) =>
    updateDraft({
      ...draft,
      xColumn,
      queries: draft.queries.map((q, i) =>
        i === xTab?.index && q?.partitionByColumn === xColumn
          ? { ...q, partitionByColumn: undefined }
          : q,
      ),
    })

  const setHeatmapValue = (index: number, value: string | undefined) =>
    updateDraft({
      ...draft,
      heatmapValues: { ...draft.heatmapValues, [index]: value },
    })
  const heatmapValueAt = (index: number) =>
    draft.heatmapValues?.[index] ?? draft.queries[index]?.yColumns[0]

  const setQuery = (index: number, next: QueryChart) =>
    updateDraft({
      ...draft,
      queries: draft.queries.map((q, i) => (i === index ? next : q)),
      heatmapValues: { ...draft.heatmapValues, [index]: undefined },
    })

  const commit = () => {
    if (heatmapConflict) return
    const badIdx = draft.queries.findIndex(candlestickMissingOhlc)
    if (badIdx >= 0) {
      telemetry?.onSaveBlocked?.("ohlc_incomplete")
      setSaveAttempted(true)
      setActiveIndex(badIdx)
      return
    }
    const heatmapIdx = draft.queries.findIndex((q, index) =>
      heatmapIncomplete(
        q,
        placements.find(({ item }) => item.index === index),
        heatmapValueAt(index),
      ),
    )
    if (heatmapIdx >= 0) {
      telemetry?.onSaveBlocked?.("heatmap_incomplete")
      setSaveAttempted(true)
      setActiveIndex(heatmapIdx)
      return
    }
    telemetry?.onSave?.({
      chartType: primary?.type,
      seriesCount: primary?.yColumns.length ?? 0,
      queryCount: draft.queries.filter((q) => q != null).length,
      hasRightAxis: hasRight,
      partitioned: draft.queries.some((q) => q?.partitionByColumn != null),
    })
    const { referenceLines: _lines, heatmapValues, ...rest } = draft
    const queries = rest.queries.map((q, i) => {
      const value = heatmapValues?.[i]
      return q?.type === "heatmap" && value !== undefined
        ? { ...q, yColumns: value ? [value] : [] }
        : q
    })
    const referenceLines = savedReferenceLines(draft.referenceLines)
    onSave({
      ...rest,
      xColumn,
      queries,
      ...(referenceLines && { referenceLines }),
    })
    if (presentation === "drawer") onClose?.()
  }

  return (
    <SettingsDrawerShell
      {...(presentation === "panel"
        ? { presentation, onReset: resetDraft }
        : { presentation })}
      open={open}
      appearInPlace={appearInPlace}
      title="Chart settings"
      dataHookBase="chart-settings"
      onDismiss={dismiss}
      onCommit={commit}
    >
      {heatmapConflict && (
        <div role="alert">
          <Text color="statusWarning">
            Heatmaps need a chart of their own. Include only one query or choose
            a different chart type.
          </Text>
        </div>
      )}
      <Field>
        <FieldLabel>X-axis</FieldLabel>
        <SelectMenuControl
          name="x-axis"
          ariaLabel="X-axis"
          value={selectedX ?? ""}
          placeholder="Select column"
          onValueChange={(value) => changeXColumn(value || null)}
          options={xCandidates.map((c) => ({
            label: c.name,
            value: c.name,
          }))}
        />
      </Field>

      {hasRight && (
        <FieldGroup>
          <FieldLabel>Right axis</FieldLabel>
          <Input
            name="right-axis-name"
            placeholder="Name (e.g. RSI)"
            value={draft.rightAxis?.name ?? ""}
            onChange={(e) =>
              updateDraft({
                ...draft,
                rightAxis: { ...draft.rightAxis, name: e.target.value },
              })
            }
          />
          <Row>
            <Input
              name="right-axis-min"
              type="number"
              placeholder="min"
              value={draft.rightAxis?.min ?? ""}
              onChange={(e) =>
                updateDraft({
                  ...draft,
                  rightAxis: {
                    ...draft.rightAxis,
                    min: parseBound(e.target.value),
                  },
                })
              }
            />
            <Input
              name="right-axis-max"
              type="number"
              placeholder="max"
              value={draft.rightAxis?.max ?? ""}
              onChange={(e) =>
                updateDraft({
                  ...draft,
                  rightAxis: {
                    ...draft.rightAxis,
                    max: parseBound(e.target.value),
                  },
                })
              }
            />
          </Row>
        </FieldGroup>
      )}

      {hasValueAxis && (
        <ReferenceLinesEditor
          lines={draft.referenceLines ?? []}
          hasRightAxis={hasRight}
          onChange={(referenceLines) =>
            updateDraft({ ...draft, referenceLines })
          }
        />
      )}

      {tabs.length > 1 && (
        <>
          <Divider />
          <FieldLabel>Queries</FieldLabel>
          <TabStrip role="tablist" aria-label="Chart queries">
            {placements.map(({ item: t, compatible }) => (
              <Tab
                key={t.index}
                type="button"
                $active={t.index === activeIndex}
                role="tab"
                onClick={() => setActiveIndex(t.index)}
                title={
                  compatible
                    ? t.query
                    : `${t.query}\n\n(x-axis incompatible — excluded)`
                }
              >
                {t.label}
                {!compatible && <IncompatibleIcon size={14} weight="fill" />}
              </Tab>
            ))}
          </TabStrip>
        </>
      )}

      {active && query && (
        <QueryControls
          activeTab={active.item}
          query={query}
          xColumn={active.item === xTab ? selectedX : active.ownX}
          compatible={active.compatible}
          canToggleIncluded={!isAnchorTab || allowAnchorExclusion}
          anchorLabel={anchor?.label ?? "Q1"}
          isAnchorTab={isAnchorTab}
          ohlcError={saveAttempted && candlestickMissingOhlc(query)}
          heatmapError={
            saveAttempted &&
            heatmapIncomplete(query, active, heatmapValueAt(active.item.index))
          }
          heatmapValue={heatmapValueAt(active.item.index)}
          onHeatmapValueChange={(value) =>
            setHeatmapValue(active.item.index, value)
          }
          onUpdateQuery={(patch) => updateQuery(active.item.index, patch)}
          onSetQuery={(next) => setQuery(active.item.index, next)}
          telemetry={telemetry}
        />
      )}
    </SettingsDrawerShell>
  )
}

export const ChartSettingsDrawer: React.FC<
  SharedProps & {
    open: boolean
    onClose: () => void
    initialDraft: ChartSettingsDraft | null
    onDraftChange: (draft: ChartSettingsDraft) => void
    appearInPlace: boolean
  }
> = (props) => <ChartSettings {...props} presentation="drawer" />

export const ChartSettingsPanel: React.FC<SharedProps> = (props) => (
  <ChartSettings {...props} presentation="panel" open />
)
