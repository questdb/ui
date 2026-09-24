import React, { useState } from "react"
import { Button } from "../../../../components"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import {
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
  type DraftRule,
} from "./ruleDraft"
import {
  AddRow,
  RuleList,
  SectionHeader,
  SectionHint,
  SectionTitle,
} from "./highlightSettingsStyles"

type Props = {
  columns: ColumnDefinition[]
  config: HighlightConfig
  stats: MatchStats | null
  onSave: (config: HighlightConfig) => void
  onClear: () => void
  onCancel: (method: SettingsDismissMethod) => void
}

// Mounted only while open, so the draft starts from the saved config.
export const HighlightSettingsDrawer: React.FC<Props> = ({
  columns,
  config,
  stats,
  onSave,
  onClear,
  onCancel,
}) => {
  const [draft, setDraft] = useState<DraftConfig>(config)
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null)

  const setRules = (rules: DraftRule[]) => setDraft({ ...draft, rules })

  const addRule = () => {
    const rule = createUnsetRule(createRuleId())
    setRules([...draft.rules, rule])
    setExpandedRuleId(rule.id)
  }

  const updateRule = (next: DraftRule) => {
    setRules(draft.rules.map((rule) => (rule.id === next.id ? next : rule)))
  }

  const save = () =>
    onSave({
      identityColumns: draft.identityColumns,
      rules: draft.rules.filter(isCompleteRule),
    })

  return (
    <SettingsDrawerShell
      presentation="drawer"
      open
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
    >
      <IdentitySection
        columns={columns}
        value={draft.identityColumns}
        stats={stats}
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
