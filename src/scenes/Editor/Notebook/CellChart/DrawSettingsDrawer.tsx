import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import styled from "styled-components"
import { XCircleIcon } from "@phosphor-icons/react"
import { Text } from "../../../../components"
import {
  NotebookViewToggle,
  NotebookViewToggleSegment,
} from "../NotebookViewToggle"
import type { ChartConfig } from "./chartTypes"
import type { ChartSettingsTelemetry } from "./chartSettingsTelemetry"
import type { QueryTab } from "../DrawCanvas/drawCanvasUtils"
import type { StatementRows } from "../visuals/statementRows"
import {
  SettingsDrawerShell,
  type SettingsDismissMethod,
} from "../settingsDrawer/SettingsDrawerShell"
import {
  PresetChartFields,
  candlestickMissingOhlc,
  savePayloadOf,
} from "./ChartSettingsDrawer"
import { ComponentSettings } from "./ComponentSettings"
import { CustomOptionSettings } from "./CustomOptionSettings"
import { SettingsTabs } from "../settingsDrawer/SettingsTabs"
import { ColumnFormatsEditor } from "../CellFormats/ColumnFormatsEditor"
import { columnsAndSamplesOf } from "../CellFormats/formatSummary"
import {
  DRAW_KINDS,
  draftOf,
  settingsOf,
  starterCustomOption,
  type DrawDraft,
  type DrawKind,
  type DrawSettings,
} from "./drawSettings"

const KindSwitch = styled(NotebookViewToggle)`
  display: flex;
  width: 100%;

  & > button {
    flex: 1 1 0;
  }
`

const SaveError = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;

  svg {
    flex-shrink: 0;
    margin-top: 0.15rem;
    color: ${({ theme }) => theme.color.statusDanger};
  }
`

type Section = "chart" | "formats"

const SECTIONS: { id: Section; label: string }[] = [
  { id: "chart", label: "Chart" },
  { id: "formats", label: "Formats" },
]

const KIND_HINTS: Record<DrawKind, string> = {
  chart: "A preset chart: lines, areas, bars, scatter, pie, candlesticks.",
  component:
    "A dashboard component: stat tiles, gauges, an order book, uptime bars, maps and more.",
  custom: "An ECharts option you write as JSON, for charts no preset draws.",
}

type Props = {
  open: boolean
  onClose: () => void
  // A draft carried across a cell remount, and where edits go.
  initialDraft: DrawDraft | null
  onDraftChange: (draft: DrawDraft) => void
  appearInPlace: boolean
  tabs: QueryTab[]
  // What the cell saved, and the preset chart it resolves to.
  saved: DrawSettings
  effective: ChartConfig
  statements: (StatementRows | null)[]
  onSave: (next: DrawSettings) => void
  telemetry?: ChartSettingsTelemetry
}

/** A draw cell's settings: a preset chart, a component or a custom option. */
export const DrawSettingsDrawer: React.FC<Props> = ({
  open,
  onClose,
  initialDraft,
  onDraftChange,
  appearInPlace,
  tabs,
  saved,
  effective,
  statements,
  onSave,
  telemetry,
}) => {
  const [draft, setDraft] = useState<DrawDraft>(
    () => initialDraft ?? draftOf(saved, effective),
  )
  const [activeIndex, setActiveIndex] = useState<number>(tabs[0]?.index ?? 0)
  const [saveAttempted, setSaveAttempted] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [section, setSection] = useState<Section>("chart")
  const { columns, samples } = useMemo(
    () => columnsAndSamplesOf(statements),
    [statements],
  )
  // Mounting already open means a remount mid-session: keep the draft.
  const wasOpenRef = useRef(open)

  const updateDraft = useCallback(
    (next: DrawDraft) => {
      setDraft(next)
      setSaveError(null)
      onDraftChange(next)
    },
    [onDraftChange],
  )

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current
    wasOpenRef.current = open
    if (!justOpened) return
    updateDraft(draftOf(saved, effective))
    setActiveIndex(tabs[0]?.index ?? 0)
    setSaveAttempted(false)
    setSection("chart")
  }, [open, saved, effective, tabs, updateDraft])

  const dismiss = useCallback(
    (method: SettingsDismissMethod) => {
      telemetry?.onCancel?.(method)
      onClose()
    },
    [telemetry, onClose],
  )

  const switchKind = (kind: DrawKind) => {
    if (kind === draft.kind) return
    updateDraft({
      ...draft,
      kind,
      visual:
        kind === "component" && !draft.visual ? { type: "stat" } : draft.visual,
      customJson:
        kind === "custom" && draft.customJson.trim() === ""
          ? JSON.stringify(starterCustomOption(draft.chart, tabs), null, 2)
          : draft.customJson,
    })
  }

  const commit = () => {
    if (draft.kind === "chart") {
      const badIdx = draft.chart.queries.findIndex(candlestickMissingOhlc)
      if (badIdx >= 0) {
        telemetry?.onSaveBlocked?.("ohlc_incomplete")
        setSaveAttempted(true)
        setActiveIndex(badIdx)
        setSection("chart")
        return
      }
    }
    const result = settingsOf(draft)
    if (!result.ok) {
      setSaveError(result.error)
      setSection("chart")
      return
    }
    telemetry?.onSave?.({
      ...savePayloadOf(draft.chart, tabs),
      kind: draft.kind,
    })
    onSave(result.settings)
    onClose()
  }

  return (
    <SettingsDrawerShell
      presentation="drawer"
      open={open}
      appearInPlace={appearInPlace}
      title="Chart settings"
      dataHookBase="chart-settings"
      drawerWidth={
        draft.kind === "custom" && section === "chart" ? "52rem" : undefined
      }
      onDismiss={dismiss}
      onCommit={commit}
      footerNote={
        saveError && (
          <SaveError role="alert">
            <XCircleIcon size={14} weight="fill" />
            <Text color="contentPrimary" size="xs" lineHeight="1.3">
              {saveError}
            </Text>
          </SaveError>
        )
      }
    >
      <SettingsTabs
        tabs={SECTIONS}
        active={section}
        onChange={setSection}
        ariaLabel="Chart settings sections"
      />

      {section === "formats" && (
        <ColumnFormatsEditor
          formats={draft.formats}
          onChange={(formats) => updateDraft({ ...draft, formats })}
          columns={columns}
          samples={samples}
          cellVisuals={false}
        />
      )}

      {section === "chart" && (
        <>
          <KindSwitch role="group" aria-label="Draw as">
            {DRAW_KINDS.map(({ kind, label }) => (
              <NotebookViewToggleSegment
                key={kind}
                type="button"
                $size="sm"
                $active={draft.kind === kind}
                $activeTone="neutral"
                aria-pressed={draft.kind === kind}
                onClick={() => switchKind(kind)}
              >
                {label}
              </NotebookViewToggleSegment>
            ))}
          </KindSwitch>
          <Text color="contentSecondary" size="xs" lineHeight="1.4">
            {KIND_HINTS[draft.kind]}
          </Text>

          {draft.kind === "chart" && (
            <PresetChartFields
              tabs={tabs}
              draft={draft.chart}
              onChange={(chart) =>
                updateDraft({ ...draft, chart, chartEdited: true })
              }
              activeIndex={activeIndex}
              onActiveIndexChange={setActiveIndex}
              saveAttempted={saveAttempted}
              telemetry={telemetry}
              offerEvents
            />
          )}

          {draft.kind === "component" && draft.visual && (
            <ComponentSettings
              visual={draft.visual}
              statements={statements}
              onChange={(visual) => updateDraft({ ...draft, visual })}
            />
          )}

          {draft.kind === "custom" && (
            <CustomOptionSettings
              json={draft.customJson}
              statements={statements}
              onChange={(customJson) => updateDraft({ ...draft, customJson })}
              onStartFromChart={() =>
                updateDraft({
                  ...draft,
                  customJson: JSON.stringify(
                    starterCustomOption(draft.chart, tabs),
                    null,
                    2,
                  ),
                })
              }
            />
          )}
        </>
      )}
    </SettingsDrawerShell>
  )
}
