import React, { useEffect, useRef, useState } from "react"
import styled, { useTheme } from "styled-components"
import { TrashIcon } from "@phosphor-icons/react"
import { Button, Checkbox, Input, Text } from "../../../../components"
import {
  CELL_VISUALS,
  FORMAT_KINDS,
  TONES,
  formatValue,
  toneColor,
  toneTextColor,
  toneOf,
  type CellVisual,
  type ColumnFormat,
  type FormatKind,
  type Tone,
} from "../../../../utils/formats/columnFormat"
import {
  CheckboxRow,
  Field,
  FieldGroup,
  FieldLabel,
  SettingsSelect,
} from "../CellChart/chartSettingsStyles"
import {
  CELL_VISUAL_LABELS,
  KIND_LABELS,
  TONE_LABELS,
  colourModeOf,
  withColourMode,
  type ColourMode,
} from "./formatSummary"

const Row = styled.div`
  display: flex;
  gap: 0.8rem;
  align-items: flex-end;
  & > * {
    flex: 1 1 0;
    min-width: 0;
  }
`

const Swatch = styled.span<{ $color: string }>`
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background: ${({ $color }) => $color};
`

const ThresholdRow = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(0, 1.4fr) auto;
  align-items: center;
  gap: 0.6rem;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const Preview = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.8rem;
  padding: 0.6rem 0.8rem;
  border-radius: 0.4rem;
  background: ${({ theme }) => theme.color.surfaceInset};
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-variant-numeric: tabular-nums;

  strong {
    font-family: ${({ theme }) => theme.fontMonospace};
    font-weight: 600;
  }
`

// Bars and meters for numbers; a sparkline only draws arrays.
const NUMBER_CELL_VISUALS = CELL_VISUALS.filter((v) => v !== "sparkline")

const COLOUR_LABELS: Record<ColourMode, string> = {
  none: "None",
  sign: "Green when positive, red when negative",
  thresholds: "By thresholds",
}

const MAX_AFFIX = 16

const parseNumber = (text: string): number | undefined => {
  const n = Number(text)
  return text.trim() === "" || !Number.isFinite(n) ? undefined : n
}

/** A number typed freely ("-", "0."), applied whenever it reads as one. */
const NumberInput: React.FC<{
  name: string
  ariaLabel: string
  value: number
  onChange: (value: number) => void
}> = ({ name, ariaLabel, value, onChange }) => {
  const [text, setText] = useState(String(value))
  // Follows the value when it changes from outside (a row above removed).
  useEffect(() => {
    setText((current) =>
      parseNumber(current) === value ? current : String(value),
    )
  }, [value])
  return (
    <Input
      name={name}
      type="number"
      aria-label={ariaLabel}
      value={text}
      aria-invalid={parseNumber(text) === undefined}
      onChange={(e) => {
        setText(e.target.value)
        const n = parseNumber(e.target.value)
        if (n !== undefined) onChange(n)
      }}
      onBlur={() => setText(String(value))}
    />
  )
}

export const ToneSelect: React.FC<{
  name: string
  ariaLabel: string
  value: Tone | undefined
  onChange: (tone: Tone | undefined) => void
  noneLabel?: string
}> = ({ name, ariaLabel, value, onChange, noneLabel }) => {
  const theme = useTheme()
  return (
    <SettingsSelect
      name={name}
      ariaLabel={ariaLabel}
      value={value ?? ""}
      onValueChange={(v) => onChange(v === "" ? undefined : (v as Tone))}
      options={[
        ...(noneLabel !== undefined ? [{ label: noneLabel, value: "" }] : []),
        ...TONES.map((tone) => ({
          label: TONE_LABELS[tone],
          value: tone,
          icon: <Swatch $color={toneColor(tone, theme.color)} />,
        })),
      ]}
    />
  )
}

type Props = {
  column: string
  format: ColumnFormat
  onChange: (format: ColumnFormat) => void
  // A value of the column from the result, for the preview.
  sample: unknown
  // Grid only: draw a bar, meter or sparkline in the cell.
  cellVisuals: boolean
  // What the column holds: numbers get every setting, arrays a sparkline.
  target: "number" | "array"
}

/** Every setting of one column's format, with a preview. */
export const ColumnFormatFields: React.FC<Props> = ({
  column,
  format,
  onChange,
  sample,
  cellVisuals,
  target,
}) => {
  const theme = useTheme()
  const set = <K extends keyof ColumnFormat>(
    key: K,
    value: ColumnFormat[K] | undefined,
  ) => {
    const next = { ...format }
    if (value === undefined || value === "" || value === false) delete next[key]
    else next[key] = value
    onChange(next)
  }
  const mode = colourModeOf(format)
  const thresholds = format.thresholds ?? []
  // Rows keep their identity while values are typed, added and removed.
  // Removing a threshold removes its focused button: focus moves to the value
  // of the row that takes its place (or the new last row).
  const thresholdsRef = useRef<HTMLDivElement>(null)
  const [focusThreshold, setFocusThreshold] = useState<number | null>(null)
  useEffect(() => {
    if (focusThreshold === null) return
    const label = `${column}: threshold ${focusThreshold + 1}`
    const inputs = thresholdsRef.current?.querySelectorAll("input") ?? []
    Array.from(inputs)
      .find((input) => input.getAttribute("aria-label") === label)
      ?.focus()
    setFocusThreshold(null)
  }, [focusThreshold, column])
  const nextId = useRef(0)
  const [rowIds, setRowIds] = useState<number[]>(() =>
    thresholds.map(() => nextId.current++),
  )
  // Thresholds set elsewhere (switching to thresholds) get ids once.
  const ids =
    rowIds.length === thresholds.length
      ? rowIds
      : thresholds.map((_, i) => rowIds[i] ?? -1 - i)
  useEffect(() => {
    if (rowIds.length === thresholds.length) return
    setRowIds(thresholds.map((_, i) => rowIds[i] ?? nextId.current++))
  }, [rowIds, thresholds])
  const setThreshold = (
    index: number,
    patch: Partial<{ value: number; tone: Tone }>,
  ) =>
    set(
      "thresholds",
      thresholds.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    )
  const tone = toneOf(sample, format)
  const id = (field: string) => `format-${field}-${column}`

  if (target === "array")
    return (
      <FieldGroup>
        {cellVisuals ? (
          <Field as="div">
            <FieldLabel>In the grid cell</FieldLabel>
            <SettingsSelect
              name={id("visual")}
              ariaLabel={`${column}: in the grid cell`}
              value={format.visual ?? ""}
              onValueChange={(v) =>
                set("visual", v === "" ? undefined : (v as CellVisual))
              }
              options={[
                { label: "The values, as text", value: "" },
                { label: CELL_VISUAL_LABELS.sparkline, value: "sparkline" },
              ]}
            />
          </Field>
        ) : (
          <Text color="contentSecondary" size="xs">
            Arrays draw as sparklines in the grid; set it in the grid&apos;s
            settings.
          </Text>
        )}
      </FieldGroup>
    )

  return (
    <FieldGroup>
      <Field as="div">
        <FieldLabel>Show as</FieldLabel>
        <SettingsSelect
          name={id("kind")}
          ariaLabel={`${column}: show as`}
          value={format.kind ?? "number"}
          onValueChange={(kind) =>
            set("kind", kind === "number" ? undefined : (kind as FormatKind))
          }
          options={FORMAT_KINDS.map((kind) => ({
            label: KIND_LABELS[kind],
            value: kind,
          }))}
        />
      </Field>

      {format.kind !== "text" && (
        <>
          <Row>
            <Field>
              <FieldLabel>Decimals</FieldLabel>
              <Input
                name={id("decimals")}
                type="number"
                min={0}
                max={12}
                placeholder="Auto"
                value={format.decimals ?? ""}
                onChange={(e) => {
                  const n = parseNumber(e.target.value)
                  set(
                    "decimals",
                    n === undefined
                      ? undefined
                      : Math.min(12, Math.max(0, Math.round(n))),
                  )
                }}
              />
            </Field>
            <CheckboxRow>
              <Checkbox
                checked={format.compact === true}
                onChange={(e) => set("compact", e.target.checked)}
              />
              Compact (1.2K, 3.4M)
            </CheckboxRow>
          </Row>
          <Row>
            <Field>
              <FieldLabel>Prefix</FieldLabel>
              <Input
                name={id("prefix")}
                placeholder="e.g. $"
                maxLength={MAX_AFFIX}
                value={format.prefix ?? ""}
                onChange={(e) => set("prefix", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Suffix</FieldLabel>
              <Input
                name={id("suffix")}
                placeholder="e.g. ms"
                maxLength={MAX_AFFIX}
                value={format.suffix ?? ""}
                onChange={(e) => set("suffix", e.target.value)}
              />
            </Field>
          </Row>
        </>
      )}

      <Field as="div">
        <FieldLabel>Colour</FieldLabel>
        <SettingsSelect
          name={id("colour")}
          ariaLabel={`${column}: colour`}
          value={mode}
          onValueChange={(next) =>
            onChange(withColourMode(format, next as ColourMode))
          }
          options={(Object.keys(COLOUR_LABELS) as ColourMode[]).map((m) => ({
            label: COLOUR_LABELS[m],
            value: m,
          }))}
        />
      </Field>

      {mode === "thresholds" && (
        <FieldGroup ref={thresholdsRef}>
          <Field as="div">
            <FieldLabel>Below the first threshold</FieldLabel>
            <ToneSelect
              name={id("base-tone")}
              ariaLabel={`${column}: tone below the first threshold`}
              value={format.baseTone}
              onChange={(t) => set("baseTone", t)}
              noneLabel="No colour"
            />
          </Field>
          {thresholds.map((threshold, index) => (
            <ThresholdRow key={ids[index]}>
              <span>From</span>
              <NumberInput
                name={id(`threshold-${index}`)}
                ariaLabel={`${column}: threshold ${index + 1}`}
                value={threshold.value}
                onChange={(value) => setThreshold(index, { value })}
              />
              <ToneSelect
                name={id(`threshold-tone-${index}`)}
                ariaLabel={`${column}: tone from threshold ${index + 1}`}
                value={threshold.tone}
                onChange={(t) => t && setThreshold(index, { tone: t })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove threshold ${index + 1}`}
                disabled={thresholds.length === 1}
                onClick={() => {
                  setFocusThreshold(Math.min(index, thresholds.length - 2))
                  setRowIds(ids.filter((_, i) => i !== index))
                  set(
                    "thresholds",
                    thresholds.filter((_, i) => i !== index),
                  )
                }}
              >
                <TrashIcon size={14} />
              </Button>
            </ThresholdRow>
          ))}
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setRowIds([...ids, nextId.current++])
                set("thresholds", [
                  ...thresholds,
                  {
                    value: (thresholds[thresholds.length - 1]?.value ?? 0) + 1,
                    tone: "negative",
                  },
                ])
              }}
            >
              + Add threshold
            </Button>
          </div>
        </FieldGroup>
      )}

      {cellVisuals && (
        <Field as="div">
          <FieldLabel>In the grid cell</FieldLabel>
          <SettingsSelect
            name={id("visual")}
            ariaLabel={`${column}: in the grid cell`}
            // A sparkline draws arrays only: on numbers it reads as text.
            value={format.visual === "sparkline" ? "" : (format.visual ?? "")}
            onValueChange={(v) =>
              set("visual", v === "" ? undefined : (v as CellVisual))
            }
            options={[
              { label: "Text only", value: "" },
              ...NUMBER_CELL_VISUALS.map((v) => ({
                label: CELL_VISUAL_LABELS[v],
                value: v,
              })),
            ]}
          />
        </Field>
      )}

      <Preview aria-live="polite">
        <span>Preview</span>
        {sample === undefined ? (
          <span>Run the cell to preview a value.</span>
        ) : (
          <strong
            style={
              tone
                ? {
                    color:
                      toneTextColor(tone, theme.color) ??
                      toneColor(tone, theme.color),
                  }
                : undefined
            }
          >
            {formatValue(sample, format)}
          </strong>
        )}
      </Preview>
    </FieldGroup>
  )
}
