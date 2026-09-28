import React from "react"
import { XIcon } from "@phosphor-icons/react"
import { Button, IconButton } from "../../../../components"
import {
  createRuleId,
  DEFAULT_RULE_COLOR,
  type HighlightStep,
  type StepsRule,
} from "../../../../components/ResultGrid/highlight"
import { ColorSwatch } from "./ColorSwatch"
import { FieldGroup, FieldLabel } from "../CellChart/chartSettingsStyles"
import {
  AddRow,
  CompactInput,
  FieldError,
  StepActionSlot,
  StepLabel,
  StepLine,
  StepRemainder,
} from "./highlightSettingsStyles"
import { stepErrorKey, type RuleErrors } from "./ruleValidation"

type Props = {
  rule: StepsRule
  errors: RuleErrors
  onChange: (rule: StepsRule) => void
}

// Steps stay in edit order; the engine sorts by bound when it evaluates.
// The field is uncontrolled so it can be emptied while typing; the draft
// keeps its last finite value until a new one is typed.
const parseBound = (raw: string): number | null => {
  if (raw.trim() === "") return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export const StepsEditor: React.FC<Props> = ({ rule, errors, onChange }) => {
  const steps = rule.steps
  const lowestBound = steps.reduce(
    (min, step) => Math.min(min, step.from),
    Infinity,
  )
  const highestBound = steps.reduce(
    (max, step) => Math.max(max, step.from),
    -Infinity,
  )

  const updateStep = (id: string, patch: Partial<HighlightStep>) =>
    onChange({
      ...rule,
      steps: steps.map((step) =>
        step.id === id ? { ...step, ...patch } : step,
      ),
    })

  const removeStep = (id: string) =>
    onChange({ ...rule, steps: steps.filter((step) => step.id !== id) })

  const addStep = () => {
    const last = steps[steps.length - 1]
    onChange({
      ...rule,
      steps: [
        ...steps,
        {
          id: createRuleId(),
          from: last ? highestBound + 1 : 0,
          color: last?.color ?? DEFAULT_RULE_COLOR,
        },
      ],
    })
  }

  return (
    <FieldGroup>
      <FieldLabel>Color bands</FieldLabel>
      <StepLine>
        <StepLabel>&lt;</StepLabel>
        <StepRemainder>
          {steps.length ? `below ${lowestBound}` : "All values"}
        </StepRemainder>
        <ColorSwatch
          value={rule.baseColor}
          label="Base color"
          onChange={(baseColor) => onChange({ ...rule, baseColor })}
        />
        <StepActionSlot aria-hidden />
      </StepLine>
      {steps.map((step, index) => (
        <StepLine key={step.id}>
          <StepLabel>&ge;</StepLabel>
          <CompactInput
            type="number"
            step="any"
            variant={errors[stepErrorKey(step.id)] ? "error" : undefined}
            aria-label={`Step ${index + 1} from`}
            defaultValue={step.from}
            onChange={(e) => {
              const from = parseBound(e.target.value)
              if (from !== null) updateStep(step.id, { from })
            }}
          />
          <ColorSwatch
            value={step.color}
            label={`Step ${index + 1} color`}
            onChange={(color) => updateStep(step.id, { color })}
          />
          <IconButton
            label={`Remove step ${index + 1}`}
            size="sm"
            onClick={() => removeStep(step.id)}
          >
            <XIcon size={14} />
          </IconButton>
          {errors[stepErrorKey(step.id)] && (
            <FieldError>{errors[stepErrorKey(step.id)]}</FieldError>
          )}
        </StepLine>
      ))}
      {errors.steps && <FieldError>{errors.steps}</FieldError>}
      <AddRow>
        <Button type="button" variant="ghost" size="sm" onClick={addStep}>
          + Add step
        </Button>
      </AddRow>
    </FieldGroup>
  )
}
