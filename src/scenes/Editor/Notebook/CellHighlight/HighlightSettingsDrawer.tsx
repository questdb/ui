import React, { useContext, useEffect, useMemo, useRef, useState } from "react"
import styled from "styled-components"
import type { ColumnFormats } from "../../../../utils/formats/columnFormat"
import { SettingsTabs } from "../settingsDrawer/SettingsTabs"
import { ColumnFormatsEditor } from "../CellFormats/ColumnFormatsEditor"
import { tidyFormats } from "../CellFormats/formatSummary"
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
  type InteractionsDraft,
  type VariableSlot,
} from "../interactions/InteractionsEditor"
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

/** What the grid settings drawer saves. */
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
  config: HighlightConfig
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
  hasSavedIdentity?: boolean
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

const sectionOf = (focus: Props["focus"]): GridSection =>
  focus?.section === "formats" ? "formats" : "highlights"

// Stays mounted across open/close so the shell can play its exit. The parent
// remounts it with a fresh key on each open, so the draft starts from the
// saved config.
export const HighlightSettingsDrawer: React.FC<Props> = ({
  open,
  appearInPlace,
  initialDraft,
  onDraftChange,
  columns,
  formatColumns = columns,
  columnRange,
  config,
  formats: savedFormats,
  gridMode: savedGridMode,
  interactions: savedInteractions,
  variables = [],
  samples = {},
  focus,
  defaultIdentity = [],
  hasSavedIdentity,
  duplicateCountOf,
  onSave,
  onCancel,
}) => {
  const [
    {
      config: draft,
      expandedRuleId,
      formats,
      gridMode,
      interactions,
      created = {},
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
  const [saving, setSaving] = useState(false)
  // Read after the regex engine loads: a save started before a dismiss or
  // an unmount is dropped, and one that goes on saves the edits made while
  // it waited.
  const acceptsSaveRef = useRef(open)
  const draftRef = useRef(draft)
  const formatsRef = useRef(formats)
  const gridModeRef = useRef(gridMode)
  const interactionsRef = useRef<InteractionsDraft>({ interactions, created })
  const duplicateCount = useMemo(
    () => duplicateCountOf(draft.identityColumns),
    [duplicateCountOf, draft.identityColumns],
  )

  // Every edit lands in the session store as well, so a cell remount
  // mid-session restores it.
  const updateDraft = (patch: Partial<HighlightDraft>) => {
    const next = {
      config: draft,
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

  const setDraft = (next: DraftConfig) => updateDraft({ config: next })

  const setExpandedRuleId = (id: string | null) =>
    updateDraft({ expandedRuleId: id })

  const setRules = (rules: DraftRule[], expanded = expandedRuleId) =>
    updateDraft({ config: { ...draft, rules }, expandedRuleId: expanded })

  const addRule = () => {
    const rule = createUnsetRule(createRuleId())
    setRules([...draft.rules, rule], rule.id)
  }

  const updateRule = (next: DraftRule) => {
    setRules(draft.rules.map((rule) => (rule.id === next.id ? next : rule)))
  }

  // Interactions are complete, and their new variables declare cleanly:
  // they join every query of the notebook, so the server checks them.
  // Synchronous unless there are new variables to check, so a plain save
  // stays one step.
  const interactionsComplete = (interactionDraft: InteractionsDraft) => {
    setInteractionsChecked(true)
    if (!interactionErrors(interactionDraft, variables)) return true
    setSection("interactions")
    return false
  }

  const serverAccepts = async (
    interactionDraft: InteractionsDraft,
    onRejected?: () => void,
  ): Promise<boolean> => {
    setSaving(true)
    const server = await serverInteractionErrors(
      interactionDraft,
      variables,
      (q) => quest.validateQuery(q),
    ).finally(() => setSaving(false))
    const latest = interactionsRef.current
    if (
      !acceptsSaveRef.current ||
      latest.interactions !== interactionDraft.interactions ||
      latest.created !== interactionDraft.created
    )
      return false
    setServerProblems(server)
    if (server) {
      setSection("interactions")
      onRejected?.()
    }
    return server === null
  }

  const commit = (
    current: DraftConfig,
    interactionDraft: InteractionsDraft,
  ) => {
    const next = validateRules(current.rules, columns)
    const identity = validateIdentity(current)
    setErrors(next)
    setIdentityError(identity)
    if (next.size > 0 || identity !== null) {
      setSection("highlights")
      return
    }
    onSave({
      highlight: highlightToSave(
        current.identityColumns,
        current.rules.filter(isCompleteRule),
        defaultIdentity,
        hasSavedIdentity,
      ),
      formats: tidyFormats(formatsRef.current),
      gridMode: gridModeRef.current,
      interactions: interactionDraft.interactions,
      newVariables: newVariablesInUse(interactionDraft),
    })
  }

  // Clear rules sits in the Highlights footer: when an unfinished interaction
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

  // Clears the rules, keeps the identity, and saves the rest of the draft.
  const clearRules = async () => {
    if (saving) return
    const interactionDraft = interactionsRef.current
    if (!interactionsComplete(interactionDraft)) {
      setFocusTabRequest((n) => n + 1)
      return
    }
    if (
      newVariablesInUse(interactionDraft).length > 0 &&
      !(
        (await serverAccepts(interactionDraft, () =>
          setFocusTabRequest((n) => n + 1),
        )) && acceptsSaveRef.current
      )
    )
      return
    onSave({
      highlight: highlightToSave(
        draftRef.current.identityColumns,
        [],
        defaultIdentity,
        hasSavedIdentity,
      ),
      formats: tidyFormats(formatsRef.current),
      gridMode: gridModeRef.current,
      interactions: interactionDraft.interactions,
      newVariables: newVariablesInUse(interactionDraft),
    })
  }

  const save = async () => {
    if (saving) return
    if (draft.rules.some(isPatternRule) && !isRe2Ready()) {
      setSaving(true)
      await loadRe2()
      if (!acceptsSaveRef.current) return
      setSaving(false)
    }
    const interactionDraft = interactionsRef.current
    if (!interactionsComplete(interactionDraft)) return
    if (
      newVariablesInUse(interactionDraft).length > 0 &&
      !((await serverAccepts(interactionDraft)) && acceptsSaveRef.current)
    )
      return
    commit(draftRef.current, interactionDraft)
  }

  useEffect(() => {
    acceptsSaveRef.current = open
    return () => {
      acceptsSaveRef.current = false
    }
  }, [open])

  useEffect(() => {
    draftRef.current = draft
    formatsRef.current = formats
    gridModeRef.current = gridMode
    interactionsRef.current = { interactions, created }
  }, [draft, formats, gridMode, interactions, created])

  return (
    <SettingsDrawerShell
      presentation="drawer"
      open={open}
      appearInPlace={appearInPlace}
      title="Grid settings"
      dataHookBase="highlight-settings"
      drawerWidth="48rem"
      onDismiss={onCancel}
      onCommit={save}
      committing={saving}
      footerStart={
        section === "highlights" &&
        draft.rules.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void clearRules()}
          >
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
            interactionsRef.current = next
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
                  onRemove={() =>
                    setRules(
                      draft.rules.filter((r) => r.id !== rule.id),
                      expandedRuleId === rule.id ? null : expandedRuleId,
                    )
                  }
                />
              ))}
            </ExpandableSettingsList>
            <AddRow>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addRule}
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
