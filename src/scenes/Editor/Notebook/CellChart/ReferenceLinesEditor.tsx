import React, { useId, useImperativeHandle, useRef } from "react"
import styled from "styled-components"
import { XIcon } from "@phosphor-icons/react"
import { Button, IconButton, SelectMenuControl } from "../../../../components"
import type { ReferenceLine, SeriesAxis } from "./chartTypes"
import { FieldGroup, FieldLabel, IncompatibleIcon } from "./chartSettingsStyles"
import {
  AddRow,
  CompactInput,
  FieldError,
  StatusLine,
} from "../CellHighlight/highlightSettingsStyles"

const LineRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;

  > * {
    min-width: 0;
  }
`

const ValueInput = styled(CompactInput)`
  && {
    flex: 0 0 8rem;
  }
`

const LabelInput = styled(CompactInput)`
  && {
    flex: 1 1 auto;
  }
`

const AxisSelect = styled.div`
  flex: 0 0 8rem;
`

// A line as the editor holds it. A Value field holding text that is not a
// number reads as empty, so the line keeps value NaN and this mark: Save
// refuses it, where it drops an empty row.
export type ReferenceLineDraft = ReferenceLine & { unparsedValue?: true }

// Save refuses a line with a label or typed text but no number, instead of
// dropping it with what the user typed; an entirely empty row is dropped.
export const referenceLineNeedsValue = (line: ReferenceLineDraft): boolean =>
  !Number.isFinite(line.value) && (!!line.label || !!line.unparsedValue)

const VALUE_ERROR = "Should be a number"

// An emptied value is kept as NaN while editing; saving drops the line.
const parseValue = (raw: string): number =>
  raw.trim() === "" ? NaN : Number(raw)

const valueField = (value: number) => (Number.isNaN(value) ? "" : value)

export type ReferenceLinesEditorHandle = {
  // Moves focus to the first Value field that shows an error.
  focusValueError: () => void
}

type Props = {
  lines: ReferenceLineDraft[]
  // An enabled query draws on the right axis.
  hasRightAxis: boolean
  // Save was refused: each line that needs a value says so.
  showErrors: boolean
  onChange: (lines: ReferenceLineDraft[]) => void
  ref?: React.Ref<ReferenceLinesEditorHandle>
}

// Horizontal lines at fixed values, like RSI's 30 and 70.
export const ReferenceLinesEditor: React.FC<Props> = ({
  lines,
  hasRightAxis,
  showErrors,
  onChange,
  ref,
}) => {
  const undrawnNoteId = useId()
  const valueErrorId = useId()
  // A right line outlives its axis' query: its axis stays editable, flagged
  // as removed on save until the line moves left or a query returns to the
  // right.
  const hasRightLine = lines.some((line) => line.axis === "right")
  const showAxis = hasRightAxis || hasRightLine
  const undrawn = (line: ReferenceLine) =>
    line.axis === "right" && !hasRightAxis
  // Save drops an undrawn line, so it never refuses one.
  const needsValue = (line: ReferenceLineDraft) =>
    !undrawn(line) && referenceLineNeedsValue(line)

  // Lines carry no id of their own; the rows keep theirs while edited.
  const nextId = useRef(0)
  const ids = useRef<number[]>([])
  while (ids.current.length < lines.length) ids.current.push(nextId.current++)
  ids.current.length = lines.length

  const valueFields = useRef<(HTMLInputElement | null)[]>([])
  useImperativeHandle(ref, () => ({
    focusValueError: () =>
      valueFields.current[lines.findIndex(needsValue)]?.focus(),
  }))

  const remove = (index: number) => {
    ids.current.splice(index, 1)
    onChange(lines.filter((_, i) => i !== index))
  }

  const replace = (index: number, next: ReferenceLineDraft) =>
    onChange(lines.map((line, i) => (i === index ? next : line)))

  const update = (index: number, patch: Partial<ReferenceLine>) =>
    replace(index, { ...lines[index], ...patch })

  // A number field reads as "" both when empty and when its text is not a
  // number, and onChange skips an edit that leaves it "": onInput sees every
  // edit, and badInput tells the two apart.
  const updateValue = (index: number, field: HTMLInputElement) => {
    const { unparsedValue: _unparsed, ...line } = lines[index]
    const value = parseValue(field.value)
    replace(
      index,
      field.validity.badInput
        ? { ...line, value, unparsedValue: true }
        : { ...line, value },
    )
  }

  return (
    <FieldGroup data-hook="chart-reference-lines">
      <FieldLabel>Reference lines</FieldLabel>
      {lines.map((line, index) => {
        const valueError = showErrors && needsValue(line)
        const errorId = `${valueErrorId}-${ids.current[index]}`
        return (
          <React.Fragment key={ids.current[index]}>
            <LineRow>
              <ValueInput
                ref={(field: HTMLInputElement | null) => {
                  valueFields.current[index] = field
                }}
                type="number"
                step="any"
                name={`reference-line-value-${index}`}
                aria-label={`Line ${index + 1} value`}
                aria-invalid={valueError || undefined}
                aria-describedby={valueError ? errorId : undefined}
                variant={valueError ? "error" : undefined}
                placeholder="Value"
                value={valueField(line.value)}
                onInput={(e) => updateValue(index, e.currentTarget)}
              />
              <LabelInput
                name={`reference-line-label-${index}`}
                aria-label={`Line ${index + 1} label`}
                placeholder="Label (optional)"
                value={line.label ?? ""}
                onChange={(e) =>
                  update(index, { label: e.target.value || undefined })
                }
              />
              {showAxis && (
                <AxisSelect>
                  <SelectMenuControl
                    name={`reference-line-axis-${index}`}
                    ariaLabel={`Line ${index + 1} axis`}
                    ariaInvalid={undrawn(line) || undefined}
                    ariaDescribedBy={undrawn(line) ? undrawnNoteId : undefined}
                    value={line.axis ?? "left"}
                    onValueChange={(value) =>
                      update(index, {
                        axis:
                          value === "right" ? (value as SeriesAxis) : undefined,
                      })
                    }
                    options={[
                      { label: "Left", value: "left" },
                      { label: "Right", value: "right" },
                    ]}
                  />
                </AxisSelect>
              )}
              <IconButton
                label={`Remove line ${index + 1}`}
                size="sm"
                onClick={() => remove(index)}
              >
                <XIcon size={14} />
              </IconButton>
            </LineRow>
            {valueError && <FieldError id={errorId}>{VALUE_ERROR}</FieldError>}
          </React.Fragment>
        )
      })}
      {hasRightLine && !hasRightAxis && (
        <StatusLine id={undrawnNoteId}>
          <IncompatibleIcon size={14} weight="fill" />
          No enabled query is on the right axis, so right-axis lines are removed
          on save. To keep a line, put a query on the right axis or draw the
          line on the left.
        </StatusLine>
      )}
      <AddRow>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange([...lines, { value: NaN }])}
        >
          + Add line
        </Button>
      </AddRow>
    </FieldGroup>
  )
}

// The lines worth saving: those with a value.
export const savedReferenceLines = (
  lines: ReferenceLine[] | undefined,
): ReferenceLine[] | undefined => {
  const kept = (lines ?? []).filter((line) => Number.isFinite(line.value))
  return kept.length > 0 ? kept : undefined
}
