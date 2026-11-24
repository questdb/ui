import React, { useContext, useEffect, useMemo, useRef, useState } from "react"
import styled from "styled-components"
import type { ColumnFormats } from "../../../../utils/formats/columnFormat"
import { SettingsTabs } from "../settingsDrawer/SettingsTabs"
import { useDraftSession } from "../settingsDrawer/useDraftSession"
import { sameGridSettings } from "../result-table/highlightConfig"
import { ColumnFormatsEditor } from "../CellFormats/ColumnFormatsEditor"
import { formatsToSave } from "../CellFormats/formatSummary"
import { Button } from "../../../../components"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import {
  type ColumnRange,
  type HighlightConfig,
  createRuleId,
  isRe2Ready,
  loadRe2,
} from "../../../../components/ResultGrid/highlight"
import {
  SettingsDrawerShell,
  type SettingsDismissMethod,
} from "../settingsDrawer/SettingsDrawerShell"
import { FieldGroup } from "../CellChart/chartSettingsStyles"
import { ExpandableSettingsList } from "../settingsDrawer/ExpandableSettingsItem"
import { IdentitySection } from "./IdentitySection"
import { LiveUpdatesSection } from "./LiveUpdatesSection"
import {
  InteractionsEditor,
  interactionErrors,
  newVariablesInUse,
  serverInteractionErrors,
  type VariableSlot,
} from "../interactions/InteractionsEditor"
import { interactionsToSave } from "../interactions/interactionsToSave"
import { QuestContext } from "../../../../providers/QuestProvider"
import type {
  CellInteractions,
  GridMode,
  NotebookVariable,
} from "../../../../store/notebook"
import { RuleRow } from "./RuleRow"
import {
  createUnsetRule,
  isCompleteRule,
  isPatternRule,
  moveRule,
  type DraftConfig,
  type HighlightDraft,
  type DraftRule,
} from "./ruleDraft"
import {
  AddRow,
  SectionHeader,
  SectionHint,
  SectionTitle,
  ValidationSummary,
} from "./highlightSettingsStyles"
import {
  validateIdentity,
  validateRules,
  type RuleErrors,
} from "./ruleValidation"

// Groups the section tabs for focus lookups without adding a box.
const TabsGroup = styled.div`
  display: contents;
`

export type GridSection = "highlights" | "formats" | "interactions"

const SECTIONS: { id: GridSection; label: string }[] = [
  { id: "highlights", label: "Highlights" },
  { id: "formats", label: "Formats" },
  { id: "interactions", label: "Interactions" },
]

/**
 * What the grid settings drawer saves: every field it edits, the ones the
 * user left alone as the saved values they were given (the same objects).
 */
export type GridSettingsSave = {
  highlight: HighlightConfig | null
  formats: ColumnFormats | undefined
  gridMode: GridMode | undefined
  interactions: CellInteractions | undefined
  newVariables: NotebookVariable[]
}

type Props = {
  open: boolean
  appearInPlace: boolean
  // A draft carried across a cell remount, and where edits go.
  initialDraft: HighlightDraft | null
  onDraftChange: (draft: HighlightDraft) => void
  columns: ColumnDefinition[]
  formatColumns?: ColumnDefinition[]
  columnRange: (column: string) => ColumnRange | null
  // The highlight settings the drawer edits: the saved ones, else the
  // default identity of the current result.
  config: HighlightConfig
  // The cell's saved highlight settings, if any.
  savedConfig?: HighlightConfig
  formats?: ColumnFormats
  gridMode?: GridMode
  interactions?: CellInteractions
  // The notebook's variables, for the Interactions section.
  variables?: NotebookVariable[]
  // A value per column of the current result, for format previews.
  samples?: Record<string, unknown>
  // Open on this section, and in Formats on this column.
  focus?: { section: string; column?: string } | null
  // The identity a cell without highlight settings uses.
  defaultIdentity?: string[]
  // Rows of the current result that share a key under a chosen identity.
  duplicateCountOf: (identityColumns: string[]) => number
  onSave: (next: GridSettingsSave) => void
  onCancel: (method: SettingsDismissMethod) => void
}

/**
 * The highlight config a save stores: none while there are no rules and the
 * identity is the default, so a formats-only save writes no highlight
 * settings and the identity keeps following the query.
 */
export const highlightToSave = (
  identityColumns: string[],
  rules: HighlightConfig["rules"],
  defaultIdentity: string[],
  hasSavedIdentity = false,
): HighlightConfig | null =>
  !hasSavedIdentity &&
  rules.length === 0 &&
  identityColumns.length === defaultIdentity.length &&
  identityColumns.every((c, i) => c === defaultIdentity[i])
    ? null
    : { identityColumns, rules }

const NO_CREATED: Partial<Record<VariableSlot, NotebookVariable>> = {}
const NO_VARIABLES: NotebookVariable[] = []

const sectionOf = (focus: Props["focus"]): GridSection =>
  focus?.section === "formats" ? "formats" : "highlights"

// Stays mounted across open/close so the shell can play its exit. The parent
// remounts it with a fresh key on each open, so the draft starts from the
// saved config.
const ADD_RULE_HOOK = "highlight-add-rule"

export const HighlightSettingsDrawer: React.FC<Props> = ({
  open,
  appearInPlace,
  initialDraft,
  onDraftChange,
  columns,
  formatColumns = columns,
  columnRange,
  config,
  savedConfig,
  formats: savedFormats,
  gridMode: savedGridMode,
  interactions: savedInteractions,
  variables = NO_VARIABLES,
  samples = {},
  focus,
  defaultIdentity = [],
  duplicateCountOf,
  onSave,
  onCancel,
}) => {
  const [
    {
      config: draft,
      configEdited = false,
      expandedRuleId,
      formats,
      gridMode,
      interactions,
      created = NO_CREATED,
    },
    setDraftState,
  ] = useState<HighlightDraft>(
    initialDraft ?? {
      config,
      expandedRuleId: null,
      formats: savedFormats,
      gridMode: savedGridMode,
      interactions: savedInteractions,
      created: {},
    },
  )
  // After a save attempt, interaction problems show as the user fixes them.
  const [interactionsChecked, setInteractionsChecked] = useState(false)
  const [serverProblems, setServerProblems] = useState<Partial<
    Record<VariableSlot, string>
  > | null>(null)
  const { quest } = useContext(QuestContext)
  const interactionProblems = interactionsChecked
    ? (interactionErrors({ interactions, created }, variables) ??
      serverProblems)
    : null
  const [section, setSection] = useState<GridSection>(() => sectionOf(focus))
  // A column a request asked for, until the Formats section has opened it.
  const [focusColumn, setFocusColumn] = useState<string | null>(null)
  // Each request (a header's "Format column", also while open) moves the
  // drawer once.
  useEffect(() => {
    if (!focus) return
    setSection(sectionOf(focus))
    setFocusColumn(focus.section === "formats" ? (focus.column ?? null) : null)
  }, [focus])
  // Checked on Save only; the map stays until the next Save.
  const [errors, setErrors] = useState<Map<string, RuleErrors>>(new Map())
  const [identityError, setIdentityError] = useState<string | null>(null)
  const duplicateCount = useMemo(
    () => duplicateCountOf(draft.identityColumns),
    [duplicateCountOf, draft.identityColumns],
  )

  // Every edit lands in the session store as well, so a cell remount
  // mid-session restores it.
  const updateDraft = (patch: Partial<HighlightDraft>) => {
    const next = {
      config: draft,
      configEdited,
      expandedRuleId,
      formats,
      gridMode,
      interactions,
      created,
      ...patch,
    }
    setDraftState(next)
    onDraftChange(next)
  }

  const setDraft = (next: DraftConfig) =>
    updateDraft({ config: next, configEdited: true })

  const setExpandedRuleId = (id: string | null) =>
    updateDraft({ expandedRuleId: id })

  const setRules = (rules: DraftRule[], expanded = expandedRuleId) =>
    updateDraft({
      config: { ...draft, rules },
      configEdited: true,
      expandedRuleId: expanded,
    })

  // Removing a rule from its menu removes the menu's trigger too, so the
  // menu's focus handback has nowhere to go. Once it has closed, focus the
  // rule that takes its place (or the one before), else "Add rule", else the
  // drawer's title.
  const ruleListRef = useRef<HTMLUListElement>(null)
  const [focusAfterRuleRemove, setFocusAfterRuleRemove] = useState<
    number | null
  >(null)
  useEffect(() => {
    if (focusAfterRuleRemove === null) return
    const frame = requestAnimationFrame(() => {
      const list = ruleListRef.current
      const rule = list?.querySelectorAll('[data-hook="highlight-rule"]')[
        focusAfterRuleRemove
      ]
      const target =
        rule?.querySelector<HTMLElement>("button[aria-controls]") ??
        list?.parentElement?.querySelector<HTMLElement>(
          `[data-hook="${ADD_RULE_HOOK}"]`,
        ) ??
        list
          ?.closest("[role='dialog']")
          ?.querySelector<HTMLElement>("h3[tabindex='-1']")
      target?.focus()
      setFocusAfterRuleRemove(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [focusAfterRuleRemove])

  const addRule = () => {
    const rule = createUnsetRule(createRuleId())
    setRules([...draft.rules, rule], rule.id)
  }

  const updateRule = (next: DraftRule) => {
    setRules(draft.rules.map((rule) => (rule.id === next.id ? next : rule)))
  }

  // Clear rules sits in the Highlights footer: when an interaction problem
  // stops it, the button goes with the tab, so focus moves to the
  // Interactions tab that shows the problem.
  const tabsRef = useRef<HTMLDivElement>(null)
  const [focusTabRequest, setFocusTabRequest] = useState(0)
  useEffect(() => {
    if (focusTabRequest === 0) return
    tabsRef.current
      ?.querySelector<HTMLElement>("[role='tab'][aria-selected='true']")
      ?.focus()
  }, [focusTabRequest])

  // A Save or Clear rules that waits (the regex engine, the database check
  // of new variables) belongs to this session, and to the draft and
  // variables it checked.
  const variablesKey = useMemo(
    () => JSON.stringify(variables.map((v) => [v.name, v.value])),
    [variables],
  )
  const session = useDraftSession({
    open,
    config: {
      highlightConfig: savedConfig,
      formats: savedFormats,
      gridMode: savedGridMode,
      interactions: savedInteractions,
    },
    sameConfig: sameGridSettings,
    inputs: [
      draft,
      configEdited,
      formats,
      gridMode,
      interactions,
      created,
      variablesKey,
    ],
    live: {
      draft,
      configEdited,
      formats,
      gridMode,
      interactions,
      created,
      variables,
      columns,
      savedConfig,
      savedFormats,
      savedInteractions,
      defaultIdentity,
      onSave,
    },
  })
  type Live = ReturnType<typeof session.read>

  // A save: the highlight settings given, and the other sections as saved
  // unless the user changed them.
  const savedOf = (
    live: Live,
    highlight: HighlightConfig | null,
  ): GridSettingsSave => {
    const interactionDraft = {
      interactions: live.interactions,
      created: live.created,
    }
    return {
      highlight,
      formats: formatsToSave(live.savedFormats, live.formats),
      gridMode: live.gridMode,
      interactions: interactionsToSave(
        live.savedInteractions,
        interactionDraft,
      ),
      newVariables: newVariablesInUse(interactionDraft),
    }
  }

  const commit = (live: Live) => {
    const current = live.draft
    const next = validateRules(current.rules, live.columns)
    const identity = validateIdentity(current)
    setErrors(next)
    setIdentityError(identity)
    if (next.size > 0 || identity !== null) {
      setSection("highlights")
      return
    }
    live.onSave(
      savedOf(
        live,
        live.configEdited
          ? highlightToSave(
              current.identityColumns,
              current.rules.filter(isCompleteRule),
              live.defaultIdentity,
              live.savedConfig !== undefined,
            )
          : (live.savedConfig ?? null),
      ),
    )
  }

  // Clears the rules, keeps the identity, and saves the rest of the draft.
  const clear = (live: Live) =>
    live.onSave(
      savedOf(
        live,
        highlightToSave(
          live.draft.identityColumns,
          [],
          live.defaultIdentity,
          live.savedConfig !== undefined,
        ),
      ),
    )

  // Save, or Clear rules.
  const run = async (command: "save" | "clear"): Promise<void> => {
    const ticket = session.begin()
    const live = session.read()
    const showInteractions = () => {
      setSection("interactions")
      if (command === "clear") setFocusTabRequest((n) => n + 1)
    }
    if (
      command === "save" &&
      live.draft.rules.some(isPatternRule) &&
      !isRe2Ready()
    ) {
      await session.wait(ticket, loadRe2())
      if (!session.isLive(ticket)) return
      if (!session.isCurrent(ticket)) return run(command)
    }
    // Interactions are complete, and their new variables declare cleanly:
    // they join every query of the notebook, so the server checks them.
    // Synchronous unless there are new variables to check, so a plain save
    // stays one step.
    const interactionDraft = {
      interactions: live.interactions,
      created: live.created,
    }
    setInteractionsChecked(true)
    if (interactionErrors(interactionDraft, live.variables)) {
      showInteractions()
      return
    }
    if (newVariablesInUse(interactionDraft).length > 0) {
      const server = await session.wait(
        ticket,
        serverInteractionErrors(interactionDraft, live.variables, (q) =>
          quest.validateQuery(q),
        ),
      )
      if (!session.isLive(ticket)) return
      // Edited, or the variables changed, while it waited: check again.
      if (!session.isCurrent(ticket)) return run(command)
      setServerProblems(server)
      if (server) {
        showInteractions()
        return
      }
    }
    if (command === "clear") clear(session.read())
    else commit(session.read())
  }

  const start = (command: "save" | "clear") => {
    if (!session.isBusy()) void run(command)
  }

  return (
    <SettingsDrawerShell
      presentation="drawer"
      open={open}
      appearInPlace={appearInPlace}
      title="Grid settings"
      dataHookBase="highlight-settings"
      drawerWidth="48rem"
      onDismiss={onCancel}
      onCommit={() => start("save")}
      committing={session.busy}
      footerStart={
        section === "highlights" &&
        draft.rules.length > 0 && (
          <Button type="button" variant="ghost" onClick={() => start("clear")}>
            Clear rules
          </Button>
        )
      }
      footerNote={
        (errors.size > 0 || identityError !== null) && (
          <ValidationSummary role="alert" data-hook="highlight-validation">
            Failed to validate the rules
          </ValidationSummary>
        )
      }
    >
      <TabsGroup ref={tabsRef}>
        <SettingsTabs
          tabs={SECTIONS}
          active={section}
          onChange={setSection}
          ariaLabel="Grid settings sections"
        />
      </TabsGroup>

      {section === "interactions" && (
        <InteractionsEditor
          draft={{ interactions, created }}
          onChange={(next) => {
            setServerProblems(null)
            updateDraft({
              interactions: next.interactions,
              created: next.created,
            })
          }}
          variables={variables}
          columns={columns}
          clickTarget="cell"
          brush={null}
          errors={interactionProblems}
        />
      )}

      {section === "formats" && (
        <ColumnFormatsEditor
          formats={formats}
          onChange={(next) => updateDraft({ formats: next })}
          columns={formatColumns}
          samples={samples}
          cellVisuals
          focusColumn={focusColumn}
          onFocusHandled={() => setFocusColumn(null)}
        />
      )}

      {section === "highlights" && (
        <>
          <IdentitySection
            columns={columns}
            value={draft.identityColumns}
            duplicateCount={duplicateCount}
            error={identityError}
            onChange={(identityColumns) =>
              setDraft({ ...draft, identityColumns })
            }
          />

          <LiveUpdatesSection
            mode={gridMode}
            identityColumns={draft.identityColumns}
            columns={columns}
            onChange={(next) => updateDraft({ gridMode: next })}
          />

          <FieldGroup>
            <SectionHeader>
              <SectionTitle>
                {draft.rules.length}{" "}
                {draft.rules.length === 1 ? "rule" : "rules"}
              </SectionTitle>
              <SectionHint>First matching rule sets the cell color</SectionHint>
            </SectionHeader>
            <ExpandableSettingsList
              ref={ruleListRef}
              data-hook="highlight-rule-list"
              aria-label="Highlight rules"
            >
              {draft.rules.map((rule, index) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  columns={columns}
                  columnRange={columnRange}
                  errors={errors.get(rule.id)}
                  index={index}
                  count={draft.rules.length}
                  expanded={expandedRuleId === rule.id}
                  onToggle={() =>
                    setExpandedRuleId(
                      expandedRuleId === rule.id ? null : rule.id,
                    )
                  }
                  onChange={updateRule}
                  onMove={(move) =>
                    setRules(moveRule(draft.rules, index, move))
                  }
                  onRemove={() => {
                    setRules(
                      draft.rules.filter((r) => r.id !== rule.id),
                      expandedRuleId === rule.id ? null : expandedRuleId,
                    )
                    setFocusAfterRuleRemove(
                      Math.min(index, draft.rules.length - 2),
                    )
                  }}
                />
              ))}
            </ExpandableSettingsList>
            <AddRow>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addRule}
                dataHook={ADD_RULE_HOOK}
              >
                + Add rule
              </Button>
            </AddRow>
          </FieldGroup>
        </>
      )}
    </SettingsDrawerShell>
  )
}
