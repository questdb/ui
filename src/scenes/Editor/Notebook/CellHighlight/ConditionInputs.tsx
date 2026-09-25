import React from "react"
import type { HighlightRule } from "../../../../components/ResultGrid/highlight"
import { FieldLabel } from "../CellChart/chartSettingsStyles"
import {
  CompactInput,
  CompactSelect,
  FieldError,
  RuleField,
} from "./highlightSettingsStyles"
import type { RuleErrors } from "./ruleValidation"

const CHANGE_UNIT_OPTIONS = [
  { label: "Absolute (abs)", value: "absolute" },
  { label: "Percentage (%)", value: "percent" },
]

const parseInput = (raw: string, numeric: boolean): number | string =>
  numeric && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw

// Uncontrolled so the field can be emptied while typing; the draft keeps its
// last value until a new magnitude (0 or more) is typed.
const parseThreshold = (raw: string): number | null => {
  if (raw.trim() === "") return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export const ConditionInputs: React.FC<{
  rule: HighlightRule
  numeric: boolean
  errors: RuleErrors
  onChange: (rule: HighlightRule) => void
}> = ({ rule, numeric, errors, onChange }) => {
  const inputType = numeric ? "number" : "text"
  const variantFor = (field: string) => (errors[field] ? "error" : undefined)
  const errorFor = (field: string) =>
    errors[field] ? <FieldError>{errors[field]}</FieldError> : null
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
              min="0"
              variant={variantFor("threshold")}
              aria-label="Change threshold"
              defaultValue={condition.threshold}
              onChange={(e) => {
                const threshold = parseThreshold(e.target.value)
                if (threshold !== null) {
                  onChange({ ...rule, condition: { ...condition, threshold } })
                }
              }}
            />
            {errorFor("threshold")}
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
                variant={variantFor("pattern")}
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
              {errorFor("pattern")}
            </RuleField>
          )
        case "contains":
          return (
            <RuleField>
              <FieldLabel>Text to find</FieldLabel>
              <CompactInput
                type="text"
                variant={variantFor("text")}
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
              {errorFor("text")}
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
                  variant={variantFor("from")}
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
                {errorFor("from")}
              </RuleField>
              <RuleField>
                <FieldLabel>To</FieldLabel>
                <CompactInput
                  type={inputType}
                  step="any"
                  variant={variantFor("to")}
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
                {errorFor("to")}
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
                variant={variantFor("value")}
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
              {errorFor("value")}
            </RuleField>
          )
      }
    }
    case "steps":
      return null
  }
}
