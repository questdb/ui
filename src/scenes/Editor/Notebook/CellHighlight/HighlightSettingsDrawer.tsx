import React, { useEffect, useState } from "react"
import { Button } from "../../../../components"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import {
  type ColumnRange,
  type HighlightConfig,
  type MatchStats,
  createRuleId,
} from "../../../../components/ResultGrid/highlight"
import {
  SettingsDrawerShell,
  type SettingsDismissMethod,
} from "../settingsDrawer/SettingsDrawerShell"
import { FieldGroup } from "../CellChart/chartSettingsStyles"
import { IdentitySection } from "./IdentitySection"
import { RuleRow } from "./RuleRow"
import {
  createUnsetRule,
  isCompleteRule,
  moveRule,
  type DraftConfig,
  type HighlightDraft,
  type DraftRule,
} from "./ruleDraft"
import {
  AddRow,
  RuleList,
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

type Props = {
  open: boolean
  appearInPlace: boolean
  // A draft carried across a cell remount, and where edits go.
  initialDraft: HighlightDraft | null
  onDraftChange: (draft: HighlightDraft) => void
  columns: ColumnDefinition[]
  columnRange: (column: string) => ColumnRange | null
  config: HighlightConfig
  stats: MatchStats | null
  onSave: (config: HighlightConfig) => void
  onClear: () => void
  onCancel: (method: SettingsDismissMethod) => void
}

// Stays mounted across open/close so the shell can play its exit. The parent
// remounts it with a fresh key on each open, so the draft starts from the
// saved config.
export const HighlightSettingsDrawer: React.FC<Props> = ({
  open,
  appearInPlace,
  initialDraft,
  onDraftChange,
  columns,
  columnRange,
  config,
  stats,
  onSave,
  onClear,
  onCancel,
}) => {
  const [draft, setDraft] = useState<DraftConfig>(
    initialDraft?.config ?? config,
  )
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(
    initialDraft?.expandedRuleId ?? null,
  )
  // Checked on Save only; the map stays until the next Save.
  const [errors, setErrors] = useState<Map<string, RuleErrors>>(new Map())
  const [identityError, setIdentityError] = useState<string | null>(null)

  const setRules = (rules: DraftRule[]) => setDraft({ ...draft, rules })

  const addRule = () => {
    const rule = createUnsetRule(createRuleId())
    setRules([...draft.rules, rule])
    setExpandedRuleId(rule.id)
  }

  const updateRule = (next: DraftRule) => {
    setRules(draft.rules.map((rule) => (rule.id === next.id ? next : rule)))
  }

  useEffect(() => {
    onDraftChange({ config: draft, expandedRuleId })
  }, [draft, expandedRuleId, onDraftChange])

  const save = () => {
    const next = validateRules(draft.rules, columns)
    const identity = validateIdentity(draft)
    setErrors(next)
    setIdentityError(identity)
    if (next.size > 0 || identity !== null) return
    onSave({
      identityColumns: draft.identityColumns,
      rules: draft.rules.filter(isCompleteRule),
    })
  }

  return (
    <SettingsDrawerShell
      presentation="drawer"
      open={open}
      appearInPlace={appearInPlace}
      title="Highlight rules"
      dataHookBase="highlight-settings"
      drawerWidth="48rem"
      onDismiss={onCancel}
      onReset={() => setDraft(config)}
      onCommit={save}
      footerStart={
        <Button type="button" variant="ghost" onClick={onClear}>
          Clear all
        </Button>
      }
      footerNote={
        (errors.size > 0 || identityError !== null) && (
          <ValidationSummary role="alert" data-hook="highlight-validation">
            Failed to validate the rules
          </ValidationSummary>
        )
      }
    >
      <IdentitySection
        columns={columns}
        value={draft.identityColumns}
        stats={stats}
        error={identityError}
        onChange={(identityColumns) => setDraft({ ...draft, identityColumns })}
      />

      <FieldGroup>
        <SectionHeader>
          <SectionTitle>
            {draft.rules.length} {draft.rules.length === 1 ? "rule" : "rules"}
          </SectionTitle>
          <SectionHint>First matching rule sets the cell color</SectionHint>
        </SectionHeader>
        <RuleList data-hook="highlight-rule-list">
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
                setExpandedRuleId(expandedRuleId === rule.id ? null : rule.id)
              }
              onChange={updateRule}
              onMove={(move) => setRules(moveRule(draft.rules, index, move))}
              onRemove={() => {
                setRules(draft.rules.filter((r) => r.id !== rule.id))
                if (expandedRuleId === rule.id) setExpandedRuleId(null)
              }}
            />
          ))}
        </RuleList>
        <AddRow>
          <Button type="button" variant="secondary" size="sm" onClick={addRule}>
            + Add rule
          </Button>
        </AddRow>
      </FieldGroup>
    </SettingsDrawerShell>
  )
}
