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
} from "@phosphor-icons/react"
import { Checkbox, DropdownMenu, IconButton } from "../../../../components"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import {
  canApplyToRow,
  type HighlightAppliesTo,
  type HighlightDisplay,
} from "../../../../components/ResultGrid/highlight"
import { FieldGroup, FieldLabel } from "../CellChart/chartSettingsStyles"
import { ColorSwatch } from "./ColorSwatch"
import { ConditionInputs } from "./ConditionInputs"
import { StepsEditor } from "./StepsEditor"
import { ruleColors, ruleDescription, ruleSummary } from "./ruleSummary"
import {
  ALL_NUMERIC_TARGET,
  conditionOptionOf,
  conditionOptionsFor,
  createRule,
  targetFromValue,
  targetKind,
  targetToValue,
  withConditionOption,
  type ConditionOption,
  type DraftRule,
  type RuleMove,
} from "./ruleDraft"
import {
  CompactSelect,
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

export const RuleRow: React.FC<Props> = ({
  rule,
  columns,
  index,
  count,
  expanded,
  onToggle,
  onChange,
  onMove,
  onRemove,
}) => {
  const kind = rule.target ? targetKind(rule.target, columns) : "other"
  const conditionOptions = (rule.target ? conditionOptionsFor(kind) : []).map(
    (descriptor) => ({
      label: descriptor.label,
      value: descriptor.value,
      description:
        descriptor.group === "previous"
          ? "vs previous result"
          : descriptor.group === "scale"
            ? "scale"
            : "vs value",
    }),
  )
  const targetOptions = [
    { label: "All numeric columns", value: ALL_NUMERIC_TARGET },
    ...columns.map((column) => ({
      label: column.name,
      value: targetToValue({ kind: "column", name: column.name }),
    })),
  ]
  const isUnset = rule.kind === "unset"
  const currentOption = isUnset ? "" : conditionOptionOf(rule)
  const optionIsValid = conditionOptions.some((o) => o.value === currentOption)

  const changeTarget = (value: string) => {
    const target = targetFromValue(value)
    if (rule.kind === "unset") {
      onChange({ ...rule, target })
      return
    }
    const nextKind = targetKind(target, columns)
    const stillValid = conditionOptionsFor(nextKind).some(
      (o) => o.value === currentOption,
    )
    const retargeted = { ...rule, target }
    onChange(
      stillValid
        ? retargeted
        : withConditionOption(
            retargeted,
            conditionOptionsFor(nextKind)[0]?.value ?? "value.eq",
          ),
    )
  }

  const changeCondition = (option: string) => {
    if (rule.kind === "unset") {
      if (rule.target) {
        onChange(createRule(rule.id, rule.target, option as ConditionOption))
      }
      return
    }
    onChange(withConditionOption(rule, option as ConditionOption))
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
            </SummaryDetails>
          </SummaryCopy>
        </RuleSummaryButton>
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
                <CompactSelect
                  name={`rule-${rule.id}-column`}
                  ariaLabel="Column"
                  value={rule.target ? targetToValue(rule.target) : ""}
                  placeholder="Column"
                  options={targetOptions}
                  onValueChange={changeTarget}
                />
              </RuleField>
              <RuleField>
                <FieldLabel>Condition</FieldLabel>
                <CompactSelect
                  name={`rule-${rule.id}-condition`}
                  ariaLabel="Condition"
                  value={optionIsValid ? currentOption : ""}
                  placeholder="Condition"
                  disabled={!rule.target}
                  options={conditionOptions}
                  onValueChange={changeCondition}
                />
              </RuleField>
            </RuleFields>
            {rule.kind !== "unset" && (
              <>
                <RuleParameters>
                  <ConditionInputs
                    rule={rule}
                    numeric={kind === "numeric"}
                    onChange={onChange}
                  />
                </RuleParameters>
                {rule.kind === "steps" && (
                  <StepsEditor rule={rule} onChange={onChange} />
                )}
                <RuleAppearance>
                  <FieldGroupCenter $multiple={rule.kind === "gradient"}>
                    <FieldLabel>
                      {rule.kind === "gradient"
                        ? "Colors"
                        : rule.kind === "steps"
                          ? "Otherwise"
                          : "Color"}
                    </FieldLabel>
                    <RuleColors>
                      {(rule.kind === "previous" || rule.kind === "value") && (
                        <ColorSwatch
                          value={rule.color}
                          label="Rule color"
                          onChange={(color) => onChange({ ...rule, color })}
                        />
                      )}
                      {rule.kind === "gradient" && (
                        <>
                          <FieldGroupCenter>
                            <ColorSwatch
                              value={rule.negativeColor}
                              label="Negative color"
                              onChange={(negativeColor) =>
                                onChange({ ...rule, negativeColor })
                              }
                            />
                            <SectionHint>Negative</SectionHint>
                          </FieldGroupCenter>
                          <FieldGroupCenter>
                            <ColorSwatch
                              value={rule.positiveColor}
                              label="Positive color"
                              onChange={(positiveColor) =>
                                onChange({ ...rule, positiveColor })
                              }
                            />
                            <SectionHint>Positive</SectionHint>
                          </FieldGroupCenter>
                        </>
                      )}
                      {rule.kind === "steps" && (
                        <ColorSwatch
                          value={rule.remainderColor}
                          label="Remainder color"
                          onChange={(remainderColor) =>
                            onChange({ ...rule, remainderColor })
                          }
                        />
                      )}
                    </RuleColors>
                  </FieldGroupCenter>
                  <RuleField>
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
                  </RuleField>
                  {canApplyToRow(rule) && (
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
                  )}
                </RuleAppearance>
              </>
            )}
          </RuleEditor>
        )}
      </div>
    </RuleCard>
  )
}
