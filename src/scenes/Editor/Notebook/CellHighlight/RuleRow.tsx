import React from "react"
import styled from "styled-components"
import {
  ArrowDownIcon,
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  ArrowUpIcon,
  CaretDownIcon,
  CaretUpIcon,
  DotsThreeIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { Checkbox, DropdownMenu, IconButton } from "../../../../components"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type {
  BetweenFill,
  ColumnRange,
  HighlightAppliesTo,
  HighlightColorToken,
  HighlightDisplay,
  RuleTarget,
} from "../../../../components/ResultGrid/highlight"
import { FieldGroup, FieldLabel } from "../CellChart/chartSettingsStyles"
import { ColorSwatch } from "./ColorSwatch"
import { ConditionInputs } from "./ConditionInputs"
import { StepsEditor } from "./StepsEditor"
import {
  ruleColors,
  ruleDescription,
  ruleFillLabel,
  ruleSummary,
} from "./ruleSummary"
import {
  ALL_NUMERIC_TARGET,
  conditionOptionOf,
  conditionOptions,
  createRule,
  targetFromValue,
  targetKind,
  targetToValue,
  withConditionOption,
  withSeededRange,
  type ConditionOption,
  type DraftRule,
  type RuleMove,
} from "./ruleDraft"
import type { RuleErrors } from "./ruleValidation"
import {
  ColumnPicker,
  CompactSelect,
  DisplayField,
  FieldError,
  RuleAlert,
  RuleAppearance,
  RuleCard,
  RuleColors,
  RuleEditor,
  RuleField,
  RuleFields,
  RuleHead,
  RuleParameters,
  RuleSummaryButton,
  SectionHint,
  SummaryCopy,
  SummaryDetails,
  SummarySwatch,
  SummarySwatches,
  SummaryTitle,
} from "./highlightSettingsStyles"

type Props = {
  rule: DraftRule
  columns: ColumnDefinition[]
  columnRange: (column: string) => ColumnRange | null
  errors: RuleErrors | undefined
  index: number
  count: number
  expanded: boolean
  onToggle: () => void
  onChange: (rule: DraftRule) => void
  onMove: (move: RuleMove) => void
  onRemove: () => void
}

const FieldGroupCenter = styled(FieldGroup)<{ $multiple?: boolean }>`
  align-items: ${({ $multiple }) => ($multiple ? "flex-start" : "center")};
`

const DISPLAY_OPTIONS: { label: string; value: HighlightDisplay }[] = [
  { label: "Flash", value: "temporary" },
  { label: "Permanent", value: "always" },
]

const APPLIES_TO_OPTIONS: { label: string; value: HighlightAppliesTo }[] = [
  { label: "Cell", value: "cell" },
  { label: "Row", value: "row" },
]

const ALL_NUMERIC_LABEL = "All numeric columns"

const FILL_OPTIONS: { label: string; value: BetweenFill["kind"] }[] = [
  { label: "Solid", value: "solid" },
  { label: "Gradient", value: "gradient" },
]

export const RuleRow: React.FC<Props> = ({
  rule,
  columns,
  columnRange,
  errors,
  index,
  count,
  expanded,
  onToggle,
  onChange,
  onMove,
  onRemove,
}) => {
  const kind = rule.target ? targetKind(rule.target, columns) : "other"
  const conditionChoices = conditionOptions().map((descriptor) => ({
    label: descriptor.label,
    value: descriptor.value,
    description:
      descriptor.group === "previous" ? "vs previous result" : "vs value",
  }))
  const targetOptions = [
    { label: ALL_NUMERIC_LABEL, value: ALL_NUMERIC_TARGET },
    ...columns.map((column) => ({
      label: column.name,
      value: targetToValue({ kind: "column", name: column.name }),
    })),
  ]
  const targetLabel =
    rule.target === null
      ? ""
      : rule.target.kind === "allNumeric"
        ? ALL_NUMERIC_LABEL
        : rule.target.name
  const isUnset = rule.kind === "unset"
  const currentOption = isUnset ? "" : conditionOptionOf(rule)

  const rangeOf = (target: RuleTarget) =>
    target.kind === "column" ? columnRange(target.name) : null

  // A picked option carries a target value; a typed name is a column.
  const changeTarget = (value: string, option: { value: string } | null) => {
    const target: RuleTarget = option
      ? targetFromValue(value)
      : { kind: "column", name: value }
    if (rule.kind === "unset") {
      onChange({ ...rule, target })
      return
    }
    onChange(withSeededRange({ ...rule, target }, rangeOf(target)))
  }

  const changeCondition = (option: string) => {
    if (rule.kind === "unset") {
      if (rule.target) {
        onChange(
          withSeededRange(
            createRule(rule.id, rule.target, option as ConditionOption),
            rangeOf(rule.target),
          ),
        )
      }
      return
    }
    onChange(
      withSeededRange(
        withConditionOption(rule, option as ConditionOption),
        rangeOf(rule.target),
      ),
    )
  }

  const betweenFill =
    rule.kind === "value" && rule.condition.op === "between"
      ? rule.condition.fill
      : null

  const changeFill = (kind: string) => {
    if (rule.kind !== "value" || rule.condition.op !== "between") return
    const fill: BetweenFill =
      kind === "gradient"
        ? { kind: "gradient", highColor: "dataPositive" }
        : { kind: "solid" }
    onChange({ ...rule, condition: { ...rule.condition, fill } })
  }

  const changeHighColor = (highColor: HighlightColorToken) => {
    if (rule.kind !== "value" || rule.condition.op !== "between") return
    onChange({
      ...rule,
      condition: { ...rule.condition, fill: { kind: "gradient", highColor } },
    })
  }

  const summary = ruleSummary(rule)
  const editorId = `highlight-rule-${rule.id}`

  return (
    <RuleCard data-hook="highlight-rule" $expanded={expanded}>
      <RuleHead>
        <Checkbox
          compact
          aria-label={`Rule ${index + 1} enabled`}
          checked={rule.enabled}
          disabled={isUnset}
          onChange={(e) =>
            rule.kind !== "unset" &&
            onChange({ ...rule, enabled: e.target.checked })
          }
        />
        <RuleSummaryButton
          type="button"
          aria-label={`${expanded ? "Collapse" : "Edit"} rule ${index + 1}: ${summary}`}
          aria-expanded={expanded}
          aria-controls={editorId}
          data-disabled={!rule.enabled}
          onClick={onToggle}
        >
          <SummaryCopy>
            <SummaryTitle>{summary}</SummaryTitle>
            <SummaryDetails>
              <SectionHint>{ruleDescription(rule)}</SectionHint>
              {!isUnset && (
                <SummarySwatches aria-hidden="true">
                  {[...new Set(ruleColors(rule))].slice(0, 3).map((color) => (
                    <SummarySwatch key={color} $color={color} />
                  ))}
                </SummarySwatches>
              )}
              {ruleFillLabel(rule) && (
                <SectionHint>{ruleFillLabel(rule)}</SectionHint>
              )}
            </SummaryDetails>
          </SummaryCopy>
        </RuleSummaryButton>
        {errors && (
          <RuleAlert
            role="img"
            aria-label={`Rule ${index + 1} has errors`}
            data-hook="highlight-rule-alert"
          >
            <WarningCircleIcon size={16} />
          </RuleAlert>
        )}
        <IconButton
          label={`${expanded ? "Collapse" : "Expand"} rule ${index + 1}`}
          size="sm"
          aria-expanded={expanded}
          aria-controls={editorId}
          onClick={onToggle}
        >
          {expanded ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
        </IconButton>
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <IconButton label={`Rule ${index + 1} actions`} size="sm">
              <DotsThreeIcon size={18} />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4}>
              <DropdownMenu.Item
                disabled={index === 0}
                onSelect={() => onMove("top")}
                icon={<ArrowLineUpIcon size={14} />}
              >
                Move to top
              </DropdownMenu.Item>
              <DropdownMenu.Item
                disabled={index === 0}
                onSelect={() => onMove(-1)}
                icon={<ArrowUpIcon size={14} />}
              >
                Move up
              </DropdownMenu.Item>
              <DropdownMenu.Item
                disabled={index === count - 1}
                onSelect={() => onMove(1)}
                icon={<ArrowDownIcon size={14} />}
              >
                Move down
              </DropdownMenu.Item>
              <DropdownMenu.Item
                disabled={index === count - 1}
                onSelect={() => onMove("bottom")}
                icon={<ArrowLineDownIcon size={14} />}
              >
                Move to bottom
              </DropdownMenu.Item>
              <DropdownMenu.Divider />
              <DropdownMenu.Item
                tone="danger"
                onSelect={onRemove}
                icon={<TrashIcon size={14} />}
              >
                Remove rule
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </RuleHead>
      <div id={editorId} hidden={!expanded}>
        {expanded && (
          <RuleEditor>
            <RuleFields>
              <RuleField>
                <FieldLabel>Column</FieldLabel>
                <ColumnPicker
                  variant="field"
                  options={targetOptions}
                  value={targetLabel}
                  placeholder="Column"
                  searchPlaceholder="Column name"
                  emptyLabel="No columns yet, type a name"
                  noMatchLabel="No columns matched"
                  allowCustom
                  ariaLabel="Column"
                  ariaInvalid={errors?.column !== undefined}
                  dataHookBase="highlight-rule-column"
                  onSelect={changeTarget}
                  onReset={() =>
                    onChange(
                      rule.kind === "unset"
                        ? { ...rule, target: null }
                        : { ...rule, target: { kind: "column", name: "" } },
                    )
                  }
                />
                {errors?.column && <FieldError>{errors.column}</FieldError>}
              </RuleField>
              <RuleField>
                <FieldLabel>Condition</FieldLabel>
                <CompactSelect
                  name={`rule-${rule.id}-condition`}
                  ariaLabel="Condition"
                  value={currentOption}
                  placeholder="Condition"
                  disabled={!rule.target}
                  options={conditionChoices}
                  onValueChange={changeCondition}
                />
                {errors?.condition && (
                  <FieldError>{errors.condition}</FieldError>
                )}
              </RuleField>
            </RuleFields>
            {rule.kind !== "unset" && (
              <>
                <RuleParameters>
                  <ConditionInputs
                    rule={rule}
                    numeric={kind === "numeric"}
                    errors={errors ?? {}}
                    onChange={onChange}
                  />
                </RuleParameters>
                {rule.kind === "steps" && (
                  <StepsEditor
                    rule={rule}
                    errors={errors ?? {}}
                    onChange={onChange}
                  />
                )}
                <RuleAppearance>
                  {betweenFill && (
                    <RuleField>
                      <FieldLabel>Fill</FieldLabel>
                      <CompactSelect
                        name={`rule-${rule.id}-fill`}
                        ariaLabel="Fill"
                        value={betweenFill.kind}
                        options={FILL_OPTIONS}
                        onValueChange={changeFill}
                      />
                    </RuleField>
                  )}
                  {rule.kind !== "steps" && (
                    <FieldGroupCenter
                      $multiple={betweenFill?.kind === "gradient"}
                    >
                      <FieldLabel>
                        {betweenFill?.kind === "gradient" ? "Colors" : "Color"}
                      </FieldLabel>
                      <RuleColors>
                        {betweenFill?.kind === "gradient" ? (
                          <>
                            <FieldGroupCenter>
                              <ColorSwatch
                                value={rule.color}
                                label="Low color"
                                onChange={(color) =>
                                  onChange({ ...rule, color })
                                }
                              />
                              <SectionHint>Low</SectionHint>
                            </FieldGroupCenter>
                            <FieldGroupCenter>
                              <ColorSwatch
                                value={betweenFill.highColor}
                                label="High color"
                                onChange={changeHighColor}
                              />
                              <SectionHint>High</SectionHint>
                            </FieldGroupCenter>
                          </>
                        ) : (
                          <ColorSwatch
                            value={rule.color}
                            label="Rule color"
                            onChange={(color) => onChange({ ...rule, color })}
                          />
                        )}
                      </RuleColors>
                    </FieldGroupCenter>
                  )}
                  <DisplayField>
                    <FieldLabel>Display</FieldLabel>
                    <CompactSelect
                      name={`rule-${rule.id}-display`}
                      ariaLabel="Display"
                      value={rule.display}
                      options={DISPLAY_OPTIONS}
                      onValueChange={(display) =>
                        onChange({
                          ...rule,
                          display: display as HighlightDisplay,
                        })
                      }
                    />
                  </DisplayField>
                  <RuleField>
                    <FieldLabel>Applies to</FieldLabel>
                    <CompactSelect
                      name={`rule-${rule.id}-applies-to`}
                      ariaLabel="Applies to"
                      value={rule.appliesTo}
                      options={APPLIES_TO_OPTIONS}
                      onValueChange={(appliesTo) =>
                        onChange({
                          ...rule,
                          appliesTo: appliesTo as HighlightAppliesTo,
                        })
                      }
                    />
                  </RuleField>
                </RuleAppearance>
              </>
            )}
          </RuleEditor>
        )}
      </div>
    </RuleCard>
  )
}
