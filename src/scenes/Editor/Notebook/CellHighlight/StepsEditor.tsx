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
  CompactInput,
  StepLabel,
  StepLine,
  StepRemainder,
} from "./highlightSettingsStyles"

type Props = {
  rule: StepsRule
  onChange: (rule: StepsRule) => void
}

// Steps stay in edit order; the engine sorts by bound when it evaluates.
export const StepsEditor: React.FC<Props> = ({ rule, onChange }) => {
  const steps = rule.steps
  const highestBound = steps.reduce(
    (max, step) => Math.max(max, step.below),
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
          below: last ? highestBound + 1 : 0,
          color: last?.color ?? DEFAULT_RULE_COLOR,
        },
      ],
    })
  }

  return (
    <FieldGroup>
      <FieldLabel>Color steps · first upper bound that matches</FieldLabel>
      {steps.map((step, index) => (
        <StepLine key={step.id}>
          <StepLabel>&lt;</StepLabel>
          <CompactInput
            type="number"
            step="any"
            aria-label={`Step ${index + 1} upper bound`}
            value={step.below}
            onChange={(e) =>
              updateStep(step.id, { below: Number(e.target.value) })
            }
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
        </StepLine>
      ))}
      <StepLine>
        <StepLabel>&ge;</StepLabel>
        <StepRemainder>
          {steps.length
            ? `${highestBound} and above use the otherwise color`
            : "Everything uses the otherwise color"}
        </StepRemainder>
        <Button type="button" variant="ghost" size="sm" onClick={addStep}>
          + Add step
        </Button>
      </StepLine>
    </FieldGroup>
  )
}
