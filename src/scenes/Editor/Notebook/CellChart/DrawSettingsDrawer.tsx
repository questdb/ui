import React, {
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import styled from "styled-components"
import { XCircleIcon } from "@phosphor-icons/react"
import { Spinner, Text } from "../../../../components"
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
import { ChartCodeBoundary } from "./lazyCharts"
import { chartOptionsOffered, withoutUnofferedOptions } from "./chartOptions"
import { SettingsTabs } from "../settingsDrawer/SettingsTabs"
import { ColumnFormatsEditor } from "../CellFormats/ColumnFormatsEditor"
import { columnsAndSamplesOf } from "../CellFormats/formatSummary"
import {
  InteractionsEditor,
  interactionErrors,
  newVariablesInUse,
  serverInteractionErrors,
  type VariableSlot,
} from "../interactions/InteractionsEditor"
import { QuestContext } from "../../../../providers/QuestProvider"
import { useNotebookState } from "../NotebookProvider"
import { normalizeVariables } from "../declareUtils"
import { classifyColumn } from "./inferChartConfig"
import type { NotebookVariable } from "../../../../store/notebook"
import {
  DRAW_KINDS,
  draftOf,
  settingsOf,
  starterCustomOption,
  type DrawDraft,
  type DrawKind,
  type DrawSettings,
} from "./drawSettings"

// The custom option editor checks options with the chart code, which loads
// with the first chart; the drawer opens without it.
const CustomOptionSettings = lazy(() =>
  import("./CustomOptionSettings").then((m) => ({
    default: m.CustomOptionSettings,
  })),
)

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

type Section = "chart" | "formats" | "interactions"

const SECTIONS: { id: Section; label: string }[] = [
  { id: "chart", label: "Chart" },
  { id: "formats", label: "Formats" },
  { id: "interactions", label: "Interactions" },
]

const TYPE_NAMES: Partial<Record<string, string>> = {
  pie: "pie",
  heatmap: "heatmap",
  boxplot: "box plot",
}

const KIND_HINTS: Record<DrawKind, string> = {
  chart:
    "A preset chart: lines, areas, bars, scatter, pie, candlesticks, heatmaps, bands, range bars, box plots.",
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
  onSave: (next: DrawSettings, newVariables: NotebookVariable[]) => void
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
  // After a save attempt, interaction problems show as the user fixes them.
  const [interactionsChecked, setInteractionsChecked] = useState(false)
  const [serverProblems, setServerProblems] = useState<Partial<
    Record<VariableSlot, string>
  > | null>(null)
  const [committing, setCommitting] = useState(false)
  const { quest } = useContext(QuestContext)
  const { settings } = useNotebookState()
  const variables = useMemo(
    () => normalizeVariables(settings.variables),
    [settings.variables],
  )
  const { columns, samples } = useMemo(
    () => columnsAndSamplesOf(statements),
    [statements],
  )
  // Mounting already open means a remount mid-session: keep the draft.
  const wasOpenRef = useRef(open)
  const saveEpoch = useRef(0)

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
    setInteractionsChecked(false)
    setServerProblems(null)
  }, [open, saved, effective, tabs, updateDraft])

  const dismiss = useCallback(
    (method: SettingsDismissMethod) => {
      saveEpoch.current++
      telemetry?.onCancel?.(method)
      onClose()
    },
    [telemetry, onClose],
  )

  // A drag sets a time window on a preset chart over time.
  const anchorX = tabs[0]?.columns.find((c) => c.name === draft.chart.xColumn)
  const anchorQuery = draft.chart.queries[tabs[0]?.index ?? 0]
  const lying =
    draft.chart.horizontal === true &&
    chartOptionsOffered(draft.chart, tabs, {}).lieDown
  const rangeStart = tabs[0]?.columns.find(
    (c) => c.name === anchorQuery?.range?.start,
  )
  // These draw on axes of their own, without a time x-axis to drag across.
  const ownAxes =
    anchorQuery?.type === "pie" ||
    anchorQuery?.type === "heatmap" ||
    anchorQuery?.type === "boxplot"
  // Range bars with times lie along a time axis of their own.
  const timeline =
    anchorQuery?.type === "rangeBar" &&
    rangeStart !== undefined &&
    classifyColumn(rangeStart) === "temporal"
  const brushAvailability =
    draft.kind !== "chart"
      ? {
          available: false as const,
          reason:
            "Dragging works on preset charts; components and custom options take clicks.",
        }
      : ownAxes || lying
        ? {
            available: false as const,
            reason: lying
              ? "Dragging needs a time x-axis; horizontal bars take clicks."
              : `Dragging needs a time x-axis; ${TYPE_NAMES[anchorQuery?.type ?? ""] ?? "these"} charts take clicks.`,
          }
        : !timeline && (!anchorX || classifyColumn(anchorX) !== "temporal")
          ? {
              available: false as const,
              reason: "Dragging needs a time x-axis.",
            }
          : { available: true as const }

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

  const interactionProblems = interactionsChecked
    ? (interactionErrors(draft, variables) ?? serverProblems)
    : null

  // A save waiting on the database check goes on only while the drawer is
  // open, and with the draft as it is then.
  const acceptsSaveRef = useRef(open)
  const draftRef = useRef(draft)
  draftRef.current = draft
  useEffect(() => {
    acceptsSaveRef.current = open
    setCommitting(false)
    return () => {
      acceptsSaveRef.current = false
      saveEpoch.current++
    }
  }, [open])

  const supportsInteractions = (value: typeof draft) =>
    value.kind !== "component" ||
    (value.visual?.type !== "bullet" && value.visual?.type !== "planTree")

  const commit = async (): Promise<void> => {
    if (committing) return
    const original = draftRef.current
    const draft = supportsInteractions(original)
      ? original
      : { ...original, interactions: undefined }
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
    setInteractionsChecked(true)
    if (interactionErrors(draft, variables)) {
      setSection("interactions")
      return
    }
    // New variables join every query of the notebook: the server checks them.
    if (newVariablesInUse(draft).length > 0) {
      const epoch = saveEpoch.current
      setCommitting(true)
      const server = await serverInteractionErrors(draft, variables, (q) =>
        quest.validateQuery(q),
      ).finally(() => {
        if (saveEpoch.current === epoch) setCommitting(false)
      })
      if (!acceptsSaveRef.current || saveEpoch.current !== epoch) return
      // Edited while the database checked: check the edits instead.
      if (draftRef.current !== original) return commit()
      setServerProblems(server)
      if (server) {
        setSection("interactions")
        return
      }
    }
    // Options the chart no longer offers (bars lying down after a switch to
    // lines, thresholds on a pie) are not saved.
    const result = settingsOf({
      ...draft,
      chart: withoutUnofferedOptions(draft.chart, tabs),
    })
    if (!result.ok) {
      setSaveError(result.error)
      setSection("chart")
      return
    }
    telemetry?.onSave?.({
      ...savePayloadOf(draft.chart, tabs),
      kind: draft.kind,
    })
    onSave(result.settings, newVariablesInUse(draft))
    onClose()
  }

  return (
    <SettingsDrawerShell
      presentation="drawer"
      open={open}
      appearInPlace={appearInPlace}
      title="Chart settings"
      dataHookBase="chart-settings"
      drawerWidth="44rem"
      onDismiss={dismiss}
      onCommit={() => void commit()}
      committing={committing}
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

      {section === "interactions" && !supportsInteractions(draft) && (
        <Text color="contentSecondary" size="sm">
          This component does not support click or drag interactions.
        </Text>
      )}

      {section === "interactions" && supportsInteractions(draft) && (
        <InteractionsEditor
          draft={draft}
          onChange={({ interactions, created }) => {
            setServerProblems(null)
            updateDraft({ ...draft, interactions, created })
          }}
          variables={variables}
          columns={columns}
          clickTarget="item"
          brush={brushAvailability}
          errors={interactionProblems}
        />
      )}

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
              formats={draft.formats ?? {}}
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
            <ChartCodeBoundary reloadNote="Reloading drops the changes not saved in this drawer.">
              <Suspense fallback={<Spinner size={18} />}>
                <CustomOptionSettings
                  json={draft.customJson}
                  statements={statements}
                  onChange={(customJson) =>
                    updateDraft({ ...draft, customJson })
                  }
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
              </Suspense>
            </ChartCodeBoundary>
          )}
        </>
      )}
    </SettingsDrawerShell>
  )
}
