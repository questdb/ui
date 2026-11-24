import React, { useMemo, useState } from "react"
import styled from "styled-components"
import { Checkbox, Input, Text } from "../../../../components"
import type {
  StateSeverity,
  VisualColumns,
  VisualConfig,
  VisualType,
} from "./chartTypes"
import { STATE_SEVERITIES } from "./chartTypes"
import { classifyColumn } from "./inferChartConfig"
import {
  CheckboxRow,
  Field,
  FieldGroup,
  FieldLabel,
  SettingsSelect,
  SettingsSearchableSelect,
} from "./chartSettingsStyles"
import { summarizePicked, togglePicked } from "./multiPick"
import type { StatementRows } from "../visuals/statementRows"
import {
  VISUAL_CATALOG,
  visualSpecOf,
  type RoleKind,
  type RoleSpec,
} from "../visuals/visualCatalog"
import { readStateSegments, severityOf } from "../visuals/stateSegments"
import { parseNumberInput as parseNumber } from "../../../../utils/values"

const Row = styled.div`
  display: flex;
  gap: 0.8rem;
  & > * {
    flex: 1 1 0;
    min-width: 0;
  }
`

const Shape = styled(Text)`
  line-height: 1.4;
`

const SectionTitle = styled.span`
  font-size: 1.2rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const StateRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 14rem;
  align-items: center;
  gap: 0.8rem;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentPrimary};

  & > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

const SEVERITY_LABELS: Record<StateSeverity, string> = {
  good: "Good",
  neutral: "Neutral",
  warning: "Warning",
  bad: "Bad",
}

const MAX_STATES = 30

const accepts = (kind: RoleKind, type: string) => {
  if (kind === "any") return true
  const role = classifyColumn({ name: "", type })
  return kind === "categorical"
    ? role === "categorical" || role === "other"
    : role === kind
}

const FieldHint = styled.span<{ $invalid: boolean }>`
  font-size: 1.1rem;
  line-height: 1.4;
  color: ${({ theme, $invalid }) =>
    $invalid ? theme.color.statusDanger : theme.color.contentSecondary};
`

const MIN_BUCKETS = 10
const MAX_BUCKETS = 365

/** The uptime bar count: typed freely, applied once it is in range. */
const BucketsField: React.FC<{
  value: number | undefined
  onChange: (value: number | undefined) => void
}> = ({ value, onChange }) => {
  const [text, setText] = useState(value === undefined ? "" : String(value))
  const n = parseNumber(text)
  const invalid =
    text.trim() !== "" &&
    (n === undefined || n < MIN_BUCKETS || n > MAX_BUCKETS)
  return (
    <Field>
      <FieldLabel>Bars across the time range</FieldLabel>
      <Input
        name="component-buckets"
        type="number"
        min={MIN_BUCKETS}
        max={MAX_BUCKETS}
        step={1}
        placeholder="90"
        value={text}
        aria-invalid={invalid}
        aria-describedby="component-buckets-hint"
        // Out of range snaps to the nearest bound when the field is left.
        onBlur={() => {
          if (n === undefined) return
          const snapped = Math.min(
            MAX_BUCKETS,
            Math.max(MIN_BUCKETS, Math.round(n)),
          )
          setText(String(snapped))
          onChange(snapped)
        }}
        onChange={(e) => {
          setText(e.target.value)
          const next = parseNumber(e.target.value)
          if (next === undefined) onChange(undefined)
          else if (next >= MIN_BUCKETS && next <= MAX_BUCKETS)
            onChange(Math.round(next))
        }}
      />
      <FieldHint id="component-buckets-hint" $invalid={invalid}>
        {MIN_BUCKETS} to {MAX_BUCKETS}; fewer are drawn when the panel is
        narrow.
      </FieldHint>
    </Field>
  )
}

type Props = {
  visual: VisualConfig
  statements: (StatementRows | null)[]
  onChange: (next: VisualConfig) => void
}

/** The settings of a component: its type, the columns it reads, its options. */

const ScaleError = styled.span`
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.statusDanger};
`
export const ComponentSettings: React.FC<Props> = ({
  visual,
  statements,
  onChange,
}) => {
  const spec = visualSpecOf(visual.type)
  const columns = statements[0]?.columns ?? []

  const setColumns = (patch: Partial<VisualColumns>) => {
    const next: VisualColumns = { ...visual.columns, ...patch }
    for (const key of Object.keys(next) as (keyof VisualColumns)[])
      if (next[key] === undefined) delete next[key]
    const updated: VisualConfig = { ...visual, columns: next }
    if (Object.keys(next).length === 0) delete updated.columns
    onChange(updated)
  }

  const set = <K extends keyof VisualConfig>(
    key: K,
    value: VisualConfig[K] | undefined,
  ) => {
    const next = { ...visual }
    if (value === undefined) delete next[key]
    else next[key] = value
    onChange(next)
  }

  const roleOptions = (role: RoleSpec) => {
    const current = visual.columns?.[role.role]
    const fitting = columns.filter((c) => accepts(role.accepts, c.type))
    const options = [
      {
        label:
          role.optional && role.fallback === "None"
            ? "None"
            : `Default: ${role.fallback}`,
        value: "",
      },
      ...fitting.map((c) => ({ label: c.name, value: c.name })),
    ]
    if (current && !fitting.some((c) => c.name === current))
      options.push({ label: `${current} (not in the result)`, value: current })
    return options
  }

  const states = useMemo(() => {
    if (!spec.options.includes("severity")) return []
    const read = readStateSegments(visual, statements[0] ?? null)
    return typeof read === "string" ? [] : read.states.slice(0, MAX_STATES)
  }, [spec, visual, statements])

  const setSeverity = (state: string, level: string) => {
    const next = { ...visual.severity }
    if (level === "") delete next[state]
    else next[state] = level as StateSeverity
    set("severity", Object.keys(next).length > 0 ? next : undefined)
  }

  const levels = visual.columns?.path ?? []
  const pathOptions = columns
    .filter((c) => accepts("categorical", c.type))
    .map((c) => ({ label: c.name, value: c.name }))

  return (
    <>
      <FieldGroup>
        <Field as="div">
          <FieldLabel>Component</FieldLabel>
          <SettingsSelect
            name="component-type"
            ariaLabel="Component"
            value={visual.type}
            onValueChange={(type) => onChange({ type: type as VisualType })}
            options={VISUAL_CATALOG.map((s) => ({
              label: s.label,
              value: s.type,
            }))}
          />
        </Field>
        <Shape color="contentSecondary" size="xs">
          {spec.shape}
        </Shape>
      </FieldGroup>

      <FieldGroup>
        <SectionTitle>Columns</SectionTitle>
        {columns.length === 0 && (
          <Text color="contentSecondary" size="xs">
            Run the cell to choose from its columns.
          </Text>
        )}
        {spec.path && (
          <Field as="div">
            <FieldLabel>Levels (in column order)</FieldLabel>
            <SettingsSearchableSelect
              ariaLabel="Levels"
              options={pathOptions}
              value={summarizePicked(levels, pathOptions)}
              selectedValues={levels}
              allowCreate={false}
              onSelect={(name) => {
                const path = togglePicked(levels, name, pathOptions)
                setColumns({ path: path.length > 0 ? path : undefined })
              }}
              onReset={() => setColumns({ path: undefined })}
              placeholder="Default: every text column"
              searchPlaceholder="Column name"
              emptyLabel="No text columns"
              noMatchLabel="No columns matched"
              dataHookBase="component-levels"
            />
          </Field>
        )}
        {spec.roles.map((role) => (
          <Field as="div" key={role.role}>
            <FieldLabel>{role.label}</FieldLabel>
            <SettingsSelect
              name={`role-${role.role}`}
              ariaLabel={role.label}
              value={visual.columns?.[role.role] ?? ""}
              onValueChange={(name) =>
                setColumns({ [role.role]: name || undefined })
              }
              options={roleOptions(role)}
            />
          </Field>
        ))}
      </FieldGroup>

      {spec.options.includes("range") && (
        <FieldGroup>
          <SectionTitle>Scale</SectionTitle>
          <Row>
            <Field>
              <FieldLabel>Min</FieldLabel>
              <Input
                name="component-min"
                type="number"
                placeholder="0"
                value={visual.min ?? ""}
                onChange={(e) => set("min", parseNumber(e.target.value))}
              />
            </Field>
            <Field>
              <FieldLabel>Max</FieldLabel>
              <Input
                name="component-max"
                type="number"
                placeholder="Automatic"
                value={visual.max ?? ""}
                onChange={(e) => set("max", parseNumber(e.target.value))}
              />
            </Field>
          </Row>
          {visual.min !== undefined &&
            visual.max !== undefined &&
            visual.min >= visual.max && (
              <ScaleError role="alert">
                The minimum must be below the maximum.
              </ScaleError>
            )}
        </FieldGroup>
      )}

      {spec.options.includes("sparkline") && (
        <Field as="div">
          <FieldLabel>Sparkline</FieldLabel>
          <SettingsSelect
            name="component-sparkline"
            ariaLabel="Sparkline"
            value={
              visual.sparklineQuery === undefined
                ? ""
                : String(visual.sparklineQuery)
            }
            onValueChange={(v) =>
              set("sparklineQuery", v === "" ? undefined : Number(v))
            }
            options={[
              {
                label: "Default: statement 2, when there is one",
                value: "",
              },
              ...statements.slice(1).map((_, i) => ({
                label: `Statement ${i + 2}`,
                value: String(i + 1),
              })),
            ]}
          />
          <Shape color="contentSecondary" size="xs">
            Rows of time and value, plus a label column matching the tiles.
          </Shape>
        </Field>
      )}

      {spec.options.includes("animateDigits") && (
        <CheckboxRow>
          <Checkbox
            checked={visual.animateDigits === true}
            onChange={(event) => set("animateDigits", event.target.checked)}
          />
          {visual.type === "orderBook"
            ? "Animate mid-price digits"
            : "Animate value digits"}
        </CheckboxRow>
      )}

      {spec.options.includes("buckets") && (
        <BucketsField
          value={visual.buckets}
          onChange={(buckets) => set("buckets", buckets)}
        />
      )}

      {spec.options.includes("severity") && (
        <FieldGroup>
          <SectionTitle>What each state means</SectionTitle>
          <Shape color="contentSecondary" size="xs">
            Uptime counts every state except bad ones. States are read from
            their names unless you set them here.
          </Shape>
          {states.length === 0 && (
            <Text color="contentSecondary" size="xs">
              No states in the result yet.
            </Text>
          )}
          {states.map((state) => (
            <StateRow key={state}>
              <span title={state}>{state}</span>
              <SettingsSelect
                name={`severity-${state}`}
                ariaLabel={`Meaning of ${state}`}
                value={visual.severity?.[state] ?? ""}
                onValueChange={(level) => setSeverity(state, level)}
                options={[
                  {
                    label: `Auto: ${SEVERITY_LABELS[severityOf(state)]}`,
                    value: "",
                  },
                  ...STATE_SEVERITIES.map((s) => ({
                    label: SEVERITY_LABELS[s],
                    value: s,
                  })),
                ]}
              />
            </StateRow>
          ))}
        </FieldGroup>
      )}
    </>
  )
}
