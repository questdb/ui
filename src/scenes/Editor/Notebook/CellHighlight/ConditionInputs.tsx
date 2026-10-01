import React from "react"
import {
  exceedsDoublePrecision,
  type BetweenBound,
  type ColumnKind,
  type ColumnRange,
  type HighlightRule,
} from "../../../../components/ResultGrid/highlight"
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

// An integer past 2^53 stays text, so a LONG compares at full precision.
const parseInput = (raw: string, numeric: boolean): number | string =>
  numeric &&
  raw !== "" &&
  Number.isFinite(Number(raw)) &&
  !exceedsDoublePrecision(raw)
    ? Number(raw)
    : raw

// An empty between bound is automatic and follows the column's current
// minimum or maximum.
const parseBound = (raw: string, numeric: boolean): BetweenBound =>
  raw === "" ? null : parseInput(raw, numeric)

const compact = (value: number) => String(Number(value.toPrecision(6)))

const autoPlaceholder = (end: keyof ColumnRange, range: ColumnRange | null) => {
  const bound = range?.[end]
  if (typeof bound === "number") return `auto · ${compact(bound)}`
  if (typeof bound === "bigint") return `auto · ${bound}`
  return `auto (${end === "from" ? "min" : "max"})`
}

const TIMESTAMP_PLACEHOLDER = "2026-09-28T10:00:00.000000Z"

const valuePlaceholder = (kind: ColumnKind | null) =>
  kind === "numeric"
    ? "100"
    : kind === "temporal"
      ? TIMESTAMP_PLACEHOLDER
      : "EURUSD"

// An emptied number field is kept as NaN so Save can flag it.
const parseNumberField = (raw: string): number =>
  raw.trim() === "" ? NaN : Number(raw)

const numberFieldValue = (value: number) => (Number.isNaN(value) ? "" : value)

export const ConditionInputs: React.FC<{
  rule: HighlightRule
  kind: ColumnKind | null
  range: ColumnRange | null
  errors: RuleErrors
  onChange: (rule: HighlightRule) => void
}> = ({ rule, kind, range, errors, onChange }) => {
  const numeric = kind === "numeric"
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
              value={numberFieldValue(condition.threshold)}
              onChange={(e) =>
                onChange({
                  ...rule,
                  condition: {
                    ...condition,
                    threshold: parseNumberField(e.target.value),
                  },
                })
              }
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
                placeholder="^EUR or (?i)eur"
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
                  placeholder={autoPlaceholder("from", range)}
                  value={condition.from ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...rule,
                      condition: {
                        ...condition,
                        from: parseBound(e.target.value, numeric),
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
                  placeholder={autoPlaceholder("to", range)}
                  value={condition.to ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...rule,
                      condition: {
                        ...condition,
                        to: parseBound(e.target.value, numeric),
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
                placeholder={valuePlaceholder(kind)}
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
    case "newRow":
      return null
  }
}
