import React, { useCallback, useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { Input, SelectMenuControl, TabButton } from "../../../../components"
import type { ChartConfig, QueryChart } from "./chartTypes"
import {
  ReferenceLinesEditor,
  savedReferenceLines,
} from "./ReferenceLinesEditor"
import type { ChartSettingsTelemetry } from "./chartSettingsTelemetry"
import { groupColumns } from "./inferChartConfig"
import { resolveQueryAxes, type QueryTab } from "../DrawCanvas/drawCanvasUtils"
import {
  dropRightAxisLinesWithoutQuery,
  hasEnabledRightAxisQuery,
} from "../../../../utils/tools/chartConfigWire"
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
  initialDraft?: ChartConfig | null
  onDraftChange?: (draft: ChartConfig) => void
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
  const [draft, setDraft] = useState<ChartConfig>(initialDraft ?? config)
  const [activeIndex, setActiveIndex] = useState<number>(tabs[0]?.index ?? 0)
  const [saveAttempted, setSaveAttempted] = useState(false)
  // Mounting already open means a remount mid-session: keep the draft.
  const drawerWasOpenRef = useRef(open)

  // Every edit lands in the session store as well, so a cell remount
  // mid-session restores it.
  const updateDraft = useCallback(
    (next: ChartConfig) => {
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

  const { anchor, xColumn, placements } = resolveQueryAxes(tabs, draft)
  const active =
    placements.find(({ item }) => item.index === activeIndex) ?? placements[0]
  const activeTab = active?.item
  const xGroups = anchor ? groupColumns(anchor.columns) : null
  const xCandidates = xGroups
    ? [...xGroups.temporal, ...xGroups.categorical, ...xGroups.numeric]
    : []
  const isAnchorTab = activeTab != null && activeTab === anchor
  const query = activeTab != null ? draft.queries[activeTab.index] : null

  const hasRight = draft.queries.some((q) => q?.axis === "right")
  const primary = anchor
    ? (draft.queries[anchor.index] ?? anchor.inferredChart)
    : null
  // A pie chart has no value axis to draw a line on.
  const hasValueAxis = primary != null && primary.type !== "pie"
  const rightAxisDrawn = hasEnabledRightAxisQuery(draft.queries)

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
        i === anchor?.index && q?.partitionByColumn === xColumn
          ? { ...q, partitionByColumn: undefined }
          : q,
      ),
    })

  const setQuery = (index: number, next: QueryChart) =>
    updateDraft({
      ...draft,
      queries: draft.queries.map((q, i) => (i === index ? next : q)),
    })

  const commit = () => {
    const badIdx = draft.queries.findIndex(candlestickMissingOhlc)
    if (badIdx >= 0) {
      telemetry?.onSaveBlocked?.("ohlc_incomplete")
      setSaveAttempted(true)
      setActiveIndex(badIdx)
      return
    }
    // The agent tools' rule, for every chart type: a right line needs an
    // enabled right query, so one without is dropped. The lines editor says
    // so; a pie hides it, and draws no line anyway.
    const referenceLines = savedReferenceLines(
      dropRightAxisLinesWithoutQuery(draft),
    )
    telemetry?.onSave?.({
      chartType: primary?.type,
      seriesCount: primary?.yColumns.length ?? 0,
      queryCount: draft.queries.filter((q) => q != null).length,
      hasRightAxis: hasRight,
      partitioned: draft.queries.some((q) => q?.partitionByColumn != null),
    })
    const { referenceLines: _lines, ...rest } = draft
    onSave({ ...rest, ...(referenceLines && { referenceLines }) })
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
      <Field>
        <FieldLabel>X-axis</FieldLabel>
        <SelectMenuControl
          name="x-axis"
          ariaLabel="X-axis"
          value={xColumn ?? ""}
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
          hasRightAxis={rightAxisDrawn}
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
                $active={t.index === activeTab?.index}
                role="tab"
                aria-selected={t.index === activeTab?.index}
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
          xColumn={active.ownX}
          compatible={active.compatible}
          anchorLabel={anchor?.label ?? "Q1"}
          isAnchorTab={isAnchorTab}
          ohlcError={saveAttempted && candlestickMissingOhlc(query)}
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
    initialDraft: ChartConfig | null
    onDraftChange: (draft: ChartConfig) => void
    appearInPlace: boolean
  }
> = (props) => <ChartSettings {...props} presentation="drawer" />

export const ChartSettingsPanel: React.FC<SharedProps> = (props) => (
  <ChartSettings {...props} presentation="panel" open />
)
