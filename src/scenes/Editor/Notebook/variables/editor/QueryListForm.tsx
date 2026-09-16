import React, { useContext, useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { PlayIcon } from "@phosphor-icons/react"
import { Button, SelectMenuControl, Text } from "../../../../../components"
import { SqlInput } from "../../../../../components/SqlInput"
import { QuestContext } from "../../../../../providers/QuestProvider"
import type {
  DeclareEntry,
  ListRefresh,
  ListSort,
  ListVariable,
  VariableOption,
} from "../../../../../store/notebook"
import { fetchQueryRows } from "../options/fetchQueryRows"
import {
  normalizeQueryOptions,
  type QueryRows,
} from "../options/normalizeQueryOptions"
import { queryPrecheck } from "../queryChecks"
import type { DraftProblem } from "../variableDrafts"
import type { QueryListVariable } from "../options/fetchVariableOptions"
import type { VariableOptionsState } from "../useVariableOptions"
import { Field, FieldRow, Fields, MonoInput } from "./Field"
import { Notice } from "./Notice"
import { OptionsPreview } from "./OptionsPreview"
import { SelectionOptions } from "./SelectionOptions"

const NONE_COLUMN = "__none__"
const REGEX_PREVIEW_DELAY_MS = 200

const REFRESH_OPTIONS: {
  value: ListRefresh
  label: string
  description: string
}[] = [
  {
    value: "onLoad",
    label: "On notebook load",
    description: "Values are fetched when the notebook opens.",
  },
  {
    value: "onTimeRangeChange",
    label: "On time range change",
    description: "Values are fetched again whenever the time range changes.",
  },
]

const SORT_OPTIONS: { value: ListSort; label: string }[] = [
  { value: "none", label: "As returned" },
  { value: "alphaAsc", label: "Alphabetical (A to Z)" },
  { value: "alphaDesc", label: "Alphabetical (Z to A)" },
  { value: "numAsc", label: "Numeric (low to high)" },
  { value: "numDesc", label: "Numeric (high to low)" },
]

const RunRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1.2rem;
`

const Notices = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
`

type Preview = {
  options: VariableOption[]
  warnings: string[]
}

type Props = {
  variable: QueryListVariable
  problem: DraftProblem | null
  entriesAbove: DeclareEntry[]
  declaredAbove: string[]
  hasTimeRange: boolean
  savedOptions: VariableOptionsState | undefined
  onChange: (variable: ListVariable) => void
}

export const QueryListForm = ({
  variable,
  problem,
  entriesAbove,
  declaredAbove,
  hasTimeRange,
  savedOptions,
  onChange,
}: Props) => {
  const { quest } = useContext(QuestContext)
  const [rows, setRows] = useState<QueryRows | null>(null)
  const [rowsPreview, setRowsPreview] = useState<Preview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [filtering, setFiltering] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const { source } = variable
  const saved = savedOptions?.status === "ready" ? savedOptions : undefined
  const hasResult = rows !== null || saved !== undefined
  const columns = rows
    ? rows.columns.map((column) => column.name)
    : (saved?.columns ?? [])
  const preview: Preview | null =
    rowsPreview ??
    (saved ? { options: saved.options, warnings: saved.warnings } : null)
  const showPreview = preview !== null && !runError && !previewError
  const returnedNoRows = rows !== null && rows.rows.length === 0

  const setSource = (patch: Partial<QueryListVariable["source"]>) =>
    onChange({ ...variable, source: { ...source, ...patch } })

  const runQuery = async () => {
    const problem = queryPrecheck(source.query, { declaredAbove, hasTimeRange })
    if (problem) {
      setRunError(problem)
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    const result = await fetchQueryRows(
      quest,
      source.query,
      entriesAbove,
      controller.signal,
    )
    if (controller.signal.aborted) return
    setRunning(false)
    if (result.kind === "error") {
      setRows(null)
      setRowsPreview(null)
      setRunError(result.error)
      return
    }
    setRunError(null)
    setRows(result.rows)
  }

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    if (!rows) return
    const controller = new AbortController()
    setFiltering(source.regex !== undefined)
    const timer = setTimeout(
      async () => {
        const result = await normalizeQueryOptions(
          rows,
          variable,
          controller.signal,
        )
        if (controller.signal.aborted) return
        setFiltering(false)
        if (result.kind === "error") {
          setPreviewError(result.error)
          return
        }
        setPreviewError(null)
        setRowsPreview({ options: result.options, warnings: result.warnings })
      },
      source.regex ? REGEX_PREVIEW_DELAY_MS : 0,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [rows, source.regex, source.labelColumn, variable.sort])

  return (
    <Fields>
      <Field
        label="Query"
        required
        hint="A single DQL to fetch options. The first column is the option value."
      >
        <SqlInput
          value={source.query}
          invalid={runError !== null || problem === "emptyQuery"}
          ariaLabel="Option query"
          dataHook="variable-query"
          onChange={(query) => {
            setRunError(null)
            setSource({ query })
          }}
          onSubmit={runQuery}
        />
      </Field>
      <RunRow>
        <Button
          variant="secondary"
          prefixIcon={<PlayIcon size={14} />}
          onClick={runQuery}
          disabled={running}
          data-hook="variable-run-query"
        >
          {running ? "Running..." : "Run query"}
        </Button>
        {filtering ? (
          <Text size="sm" color="contentSecondary">
            Filtering values...
          </Text>
        ) : (
          showPreview && (
            <Text size="sm" color="contentSecondary">
              {preview.options.length.toLocaleString()} value
              {preview.options.length === 1 ? "" : "s"}
            </Text>
          )
        )}
      </RunRow>
      {showPreview && <OptionsPreview options={preview.options} />}
      <Notices>
        {runError && (
          <Notice tone="danger" dataHook="variable-query-error">
            {runError}
          </Notice>
        )}
        {previewError && !runError && (
          <Notice tone="danger" dataHook="variable-regex-error">
            {previewError}
          </Notice>
        )}
        {hasResult && columns.length > 1 && (
          <Notice tone="warning" dataHook="variable-query-columns">
            Only the first column (<code>{columns[0]}</code>) is used as the
            value. Pick a label column below to show another column instead.
          </Notice>
        )}
        {returnedNoRows && (
          <Notice tone="warning">The query returned no values.</Notice>
        )}
        {showPreview &&
          preview.warnings.map((warning) => (
            <Notice key={warning} tone="warning">
              {warning}
            </Notice>
          ))}
      </Notices>
      {hasResult && (
        <>
          <FieldRow>
            <Field
              label="Label column"
              hint="Shown in the picker instead of the value."
            >
              <SelectMenuControl
                labelFontSize="1.4rem"
                name="label-column"
                value={source.labelColumn ?? NONE_COLUMN}
                options={[
                  { value: NONE_COLUMN, label: "(none)" },
                  ...columns.map((name) => ({ value: name, label: name })),
                ]}
                onValueChange={(labelColumn) =>
                  setSource({
                    labelColumn:
                      labelColumn === NONE_COLUMN ? undefined : labelColumn,
                  })
                }
              />
            </Field>
            <Field label="Refresh list">
              <SelectMenuControl
                labelFontSize="1.4rem"
                name="refresh"
                value={source.refresh}
                options={REFRESH_OPTIONS}
                onValueChange={(refresh) =>
                  setSource({ refresh: refresh as ListRefresh })
                }
              />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field
              label="Regex filter"
              hint="Keep only matching values from the list."
            >
              <MonoInput
                aria-label="Regex filter"
                value={source.regex ?? ""}
                placeholder="^EUR"
                autoComplete="off"
                spellCheck={false}
                variant={problem === "invalidRegex" ? "error" : undefined}
                onChange={(e) =>
                  setSource({ regex: e.target.value || undefined })
                }
              />
            </Field>
            <Field label="Sort values">
              <SelectMenuControl
                labelFontSize="1.4rem"
                name="sort"
                value={variable.sort}
                options={SORT_OPTIONS}
                onValueChange={(sort) =>
                  onChange({ ...variable, sort: sort as ListSort })
                }
              />
            </Field>
          </FieldRow>
          <SelectionOptions variable={variable} onChange={onChange} />
        </>
      )}
    </Fields>
  )
}
