import React from "react"
import styled from "styled-components"
import { Input, Text } from "../../../../components"
import type { AxisBounds } from "./chartTypes"
import {
  Field,
  FieldGroup,
  FieldLabel,
  IncompatibleIcon,
} from "./chartSettingsStyles"
import { axisBoundsError } from "./chartSettingsRules"

const Bounds = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
`

const ErrorNote = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem;
`

const parseBound = (value: string): number | undefined => {
  const n = Number(value)
  return value === "" || !Number.isFinite(n) ? undefined : n
}

type Props = {
  side: "left" | "right"
  namePlaceholder: string
  value: AxisBounds | undefined
  showError: boolean
  onChange: (next: AxisBounds) => void
}

export const AxisBoundsRow: React.FC<Props> = ({
  side,
  namePlaceholder,
  value,
  showError,
  onChange,
}) => {
  const error = showError ? axisBoundsError(value) : null
  const label = side === "left" ? "Left axis" : "Right axis"

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>{label} label</FieldLabel>
        <Input
          name={`${side}-axis-name`}
          placeholder={namePlaceholder}
          value={value?.name ?? ""}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </Field>
      <Bounds>
        <Field>
          <FieldLabel>Min</FieldLabel>
          <Input
            name={`${side}-axis-min`}
            type="number"
            placeholder="auto"
            variant={error ? "error" : undefined}
            value={value?.min ?? ""}
            onChange={(e) =>
              onChange({ ...value, min: parseBound(e.target.value) })
            }
          />
        </Field>
        <Field>
          <FieldLabel>Max</FieldLabel>
          <Input
            name={`${side}-axis-max`}
            type="number"
            placeholder="auto"
            variant={error ? "error" : undefined}
            value={value?.max ?? ""}
            onChange={(e) =>
              onChange({ ...value, max: parseBound(e.target.value) })
            }
          />
        </Field>
      </Bounds>
      {error && (
        <ErrorNote role="alert">
          <IncompatibleIcon size={14} weight="fill" />
          <Text color="statusWarning" size="xs" lineHeight="1.2">
            {error}
          </Text>
        </ErrorNote>
      )}
    </FieldGroup>
  )
}
