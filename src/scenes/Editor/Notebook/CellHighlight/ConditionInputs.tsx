import React from "react"
import type { HighlightRule } from "../../../../components/ResultGrid/highlight"
import { FieldLabel } from "../CellChart/chartSettingsStyles"
import {
  CompactInput,
  CompactSelect,
  RuleField,
} from "./highlightSettingsStyles"

const CHANGE_UNIT_OPTIONS = [
  { label: "Absolute (abs)", value: "absolute" },
  { label: "Percentage (%)", value: "percent" },
]

const parseInput = (raw: string, numeric: boolean): number | string =>
  numeric && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw

export const ConditionInputs: React.FC<{
  rule: HighlightRule
  numeric: boolean
  onChange: (rule: HighlightRule) => void
}> = ({ rule, numeric, onChange }) => {
  const inputType = numeric ? "number" : "text"
  switch (rule.kind) {
    case "previous": {
      const condition = rule.condition
      if (condition.op !== "changedBy") return null
      return (
        <>
          <RuleField>
            <FieldLabel>Change threshold</FieldLabel>
            <CompactInput
              type="number"
              step="any"
              aria-label="Change threshold"
              value={condition.threshold}
              onChange={(e) =>
                onChange({
                  ...rule,
                  condition: {
                    ...condition,
                    threshold: Number(e.target.value),
                  },
                })
              }
            />
          </RuleField>
          <RuleField>
            <FieldLabel>Unit</FieldLabel>
            <CompactSelect
              name="change-unit"
              ariaLabel="Change unit"
              value={condition.unit}
              options={CHANGE_UNIT_OPTIONS}
              onValueChange={(unit) =>
                onChange({
                  ...rule,
                  condition: {
                    ...condition,
                    unit: unit as "absolute" | "percent",
                  },
                })
              }
            />
          </RuleField>
        </>
      )
    }
    case "value": {
      const condition = rule.condition
      switch (condition.op) {
        case "isNull":
          return null
        case "matches":
          return (
            <RuleField>
              <FieldLabel>Regular expression</FieldLabel>
              <CompactInput
                type="text"
                aria-label="Regular expression"
                placeholder="^EUR or /eur/i"
                value={condition.pattern}
                onChange={(e) =>
                  onChange({
                    ...rule,
                    condition: { op: "matches", pattern: e.target.value },
                  })
                }
              />
            </RuleField>
          )
        case "contains":
          return (
            <RuleField>
              <FieldLabel>Text to find</FieldLabel>
              <CompactInput
                type="text"
                aria-label="Text to find"
                placeholder="EUR"
                value={condition.text}
                onChange={(e) =>
                  onChange({
                    ...rule,
                    condition: { op: "contains", text: e.target.value },
                  })
                }
              />
            </RuleField>
          )
        case "between":
          return (
            <>
              <RuleField>
                <FieldLabel>From</FieldLabel>
                <CompactInput
                  type={inputType}
                  step="any"
                  aria-label="From"
                  placeholder="from"
                  value={condition.from}
                  onChange={(e) =>
                    onChange({
                      ...rule,
                      condition: {
                        ...condition,
                        from: parseInput(e.target.value, numeric),
                      },
                    })
                  }
                />
              </RuleField>
              <RuleField>
                <FieldLabel>To</FieldLabel>
                <CompactInput
                  type={inputType}
                  step="any"
                  aria-label="To"
                  placeholder="to"
                  value={condition.to}
                  onChange={(e) =>
                    onChange({
                      ...rule,
                      condition: {
                        ...condition,
                        to: parseInput(e.target.value, numeric),
                      },
                    })
                  }
                />
              </RuleField>
            </>
          )
        default:
          return (
            <RuleField>
              <FieldLabel>Value</FieldLabel>
              <CompactInput
                type={inputType}
                step="any"
                aria-label="Value"
                placeholder={numeric ? "100" : "EURUSD"}
                value={condition.value}
                onChange={(e) =>
                  onChange({
                    ...rule,
                    condition: {
                      ...condition,
                      value: parseInput(e.target.value, numeric),
                    },
                  })
                }
              />
            </RuleField>
          )
      }
    }
    case "steps":
      return null
    case "gradient":
      return (
        <RuleField>
          <FieldLabel>Gradient max</FieldLabel>
          <CompactInput
            type="number"
            step="any"
            aria-label="Gradient max"
            placeholder="max: auto"
            value={rule.max === "auto" ? "" : rule.max}
            onChange={(e) =>
              onChange({
                ...rule,
                max: e.target.value === "" ? "auto" : Number(e.target.value),
              })
            }
          />
        </RuleField>
      )
  }
}
