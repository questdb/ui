import React, { useId, useRef } from "react"
import styled from "styled-components"
import { XIcon } from "@phosphor-icons/react"
import { Button, IconButton, SelectMenuControl } from "../../../../components"
import type { ReferenceLine, SeriesAxis } from "./chartTypes"
import { FieldGroup, FieldLabel, IncompatibleIcon } from "./chartSettingsStyles"
import {
  AddRow,
  CompactInput,
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

// An emptied value is kept as NaN while editing; saving drops the line.
const parseValue = (raw: string): number =>
  raw.trim() === "" ? NaN : Number(raw)

const valueField = (value: number) => (Number.isNaN(value) ? "" : value)

type Props = {
  lines: ReferenceLine[]
  // An enabled query draws on the right axis.
  hasRightAxis: boolean
  onChange: (lines: ReferenceLine[]) => void
}

// Horizontal lines at fixed values, like RSI's 30 and 70.
export const ReferenceLinesEditor: React.FC<Props> = ({
  lines,
  hasRightAxis,
  onChange,
}) => {
  const undrawnNoteId = useId()
  // A right line outlives its axis' query: its axis stays editable, flagged
  // as removed on save until the line moves left or a query returns to the
  // right.
  const hasRightLine = lines.some((line) => line.axis === "right")
  const showAxis = hasRightAxis || hasRightLine
  const undrawn = (line: ReferenceLine) =>
    line.axis === "right" && !hasRightAxis

  // Lines carry no id of their own; the rows keep theirs while edited.
  const nextId = useRef(0)
  const ids = useRef<number[]>([])
  while (ids.current.length < lines.length) ids.current.push(nextId.current++)
  ids.current.length = lines.length

  const remove = (index: number) => {
    ids.current.splice(index, 1)
    onChange(lines.filter((_, i) => i !== index))
  }

  const update = (index: number, patch: Partial<ReferenceLine>) =>
    onChange(
      lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    )

  return (
    <FieldGroup data-hook="chart-reference-lines">
      <FieldLabel>Reference lines</FieldLabel>
      {lines.map((line, index) => (
        <LineRow key={ids.current[index]}>
          <ValueInput
            type="number"
            step="any"
            name={`reference-line-value-${index}`}
            aria-label={`Line ${index + 1} value`}
            placeholder="Value"
            value={valueField(line.value)}
            onChange={(e) =>
              update(index, { value: parseValue(e.target.value) })
            }
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
                    axis: value === "right" ? (value as SeriesAxis) : undefined,
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
      ))}
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
