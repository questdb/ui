import React, { useCallback, useEffect, useState } from "react"
import styled from "styled-components"
import { Input, SelectMenuControl, TabButton } from "../../../../components"
import type { ChartConfig, QueryChart } from "./chartTypes"
import type { ChartSettingsTelemetry } from "./chartSettingsTelemetry"
import { groupColumns } from "./inferChartConfig"
import type { QueryTab } from "../DrawCanvas/drawCanvasUtils"
import {
  Field,
  FieldGroup,
  FieldLabel,
  IncompatibleIcon,
} from "./chartSettingsStyles"
import { QueryControls } from "./QueryControls"
import { SettingsDrawerShell } from "../settingsDrawer/SettingsDrawerShell"

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

export const candlestickMissingOhlc = (q: QueryChart | null): boolean => {
  if (!q || q.type !== "candlestick" || q.enabled === false) return false
  const o = q.ohlc
  if (!o || !o.open || !o.high || !o.low || !o.close) return true
  return new Set([o.open, o.high, o.low, o.close]).size !== 4
}

type PresetFieldsProps = {
  tabs: QueryTab[]
  draft: ChartConfig
  onChange: (next: ChartConfig) => void
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  saveAttempted: boolean
  telemetry?: ChartSettingsTelemetry
  offerEvents?: boolean
}

/** The preset chart's settings: x-axis, right axis and each query's series. */
export const PresetChartFields: React.FC<PresetFieldsProps> = ({
  tabs,
  draft,
  onChange: updateDraft,
  activeIndex,
  onActiveIndexChange: setActiveIndex,
  saveAttempted,
  telemetry,
  offerEvents,
}) => {
  const anchorTab = tabs[0]
  const anchorGroups = anchorTab
    ? groupColumns(anchorTab.columns)
    : { temporal: [], numeric: [], categorical: [], other: [] }
  const xCandidates = [
    ...anchorGroups.temporal,
    ...anchorGroups.categorical,
    ...anchorGroups.numeric,
  ]

  const activeTab = tabs.find((t) => t.index === activeIndex) ?? anchorTab
  const isAnchorTab = activeTab != null && activeTab.index === anchorTab?.index
  const query: QueryChart | undefined =
    activeTab != null
      ? (draft.queries[activeTab.index] ?? undefined)
      : undefined

  const hasRight = draft.queries.some((q) => q?.axis === "right")

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
        i === anchorTab?.index && q?.partitionByColumn === xColumn
          ? { ...q, partitionByColumn: undefined }
          : q,
      ),
    })

  const setQuery = (index: number, next: QueryChart) =>
    updateDraft({
      ...draft,
      queries: draft.queries.map((q, i) => (i === index ? next : q)),
    })

  return (
    <>
      <Field>
        <FieldLabel>X-axis</FieldLabel>
        <SelectMenuControl
          name="x-axis"
          ariaLabel="X-axis"
          value={draft.xColumn ?? ""}
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

      {tabs.length > 1 && (
        <>
          <Divider />
          <FieldLabel>Queries</FieldLabel>
          <TabStrip role="tablist" aria-label="Chart queries">
            {tabs.map((t) => (
              <Tab
                key={t.index}
                type="button"
                $active={t.index === activeIndex}
                role="tab"
                onClick={() => setActiveIndex(t.index)}
                title={
                  t.compatible
                    ? t.query
                    : `${t.query}\n\n(x-axis incompatible — excluded)`
                }
              >
                {t.label}
                {!t.compatible && <IncompatibleIcon size={14} weight="fill" />}
              </Tab>
            ))}
          </TabStrip>
        </>
      )}

      {activeTab && query && (
        <QueryControls
          activeTab={activeTab}
          query={query}
          xColumn={isAnchorTab ? draft.xColumn : activeTab.xColumn}
          anchorLabel={anchorTab?.label ?? "Q1"}
          isAnchorTab={isAnchorTab}
          ohlcError={saveAttempted && candlestickMissingOhlc(query)}
          onUpdateQuery={(patch) => updateQuery(activeTab.index, patch)}
          onSetQuery={(next) => setQuery(activeTab.index, next)}
          telemetry={telemetry}
          // Markers need a time axis to sit on.
          offerEvents={
            offerEvents &&
            anchorGroups.temporal.some((c) => c.name === draft.xColumn)
          }
        />
      )}
    </>
  )
}

type PanelProps = {
  tabs: QueryTab[]
  config: ChartConfig
  onSave: (next: ChartConfig) => void
  telemetry?: ChartSettingsTelemetry
}

/** The preset chart's settings beside a result chart (the Result view). */
export const ChartSettingsPanel: React.FC<PanelProps> = ({
  tabs,
  config,
  onSave,
  telemetry,
}) => {
  const [draft, setDraft] = useState<ChartConfig>(config)
  const [activeIndex, setActiveIndex] = useState<number>(tabs[0]?.index ?? 0)
  const [saveAttempted, setSaveAttempted] = useState(false)

  const resetDraft = useCallback(() => {
    setDraft(config)
    setActiveIndex(tabs[0]?.index ?? 0)
    setSaveAttempted(false)
  }, [config, tabs])

  useEffect(() => {
    setDraft(config)
    setActiveIndex((current) =>
      tabs.some((tab) => tab.index === current)
        ? current
        : (tabs[0]?.index ?? 0),
    )
    setSaveAttempted(false)
  }, [config, tabs])

  const commit = () => {
    const badIdx = draft.queries.findIndex(candlestickMissingOhlc)
    if (badIdx >= 0) {
      telemetry?.onSaveBlocked?.("ohlc_incomplete")
      setSaveAttempted(true)
      setActiveIndex(badIdx)
      return
    }
    telemetry?.onSave?.(savePayloadOf(draft, tabs))
    onSave(draft)
  }

  return (
    <SettingsDrawerShell
      presentation="panel"
      onReset={resetDraft}
      open
      title="Chart settings"
      dataHookBase="chart-settings"
      onDismiss={(method) => telemetry?.onCancel?.(method)}
      onCommit={commit}
    >
      <PresetChartFields
        tabs={tabs}
        draft={draft}
        onChange={setDraft}
        activeIndex={activeIndex}
        onActiveIndexChange={setActiveIndex}
        saveAttempted={saveAttempted}
        telemetry={telemetry}
      />
    </SettingsDrawerShell>
  )
}

export const savePayloadOf = (draft: ChartConfig, tabs: QueryTab[]) => {
  const anchorTab = tabs[0]
  const primary = anchorTab != null ? draft.queries[anchorTab.index] : null
  return {
    chartType: primary?.type,
    seriesCount: primary?.yColumns.length ?? 0,
    queryCount: draft.queries.filter((q) => q != null).length,
    hasRightAxis: draft.queries.some((q) => q?.axis === "right"),
    partitioned: draft.queries.some((q) => q?.partitionByColumn != null),
  }
}
