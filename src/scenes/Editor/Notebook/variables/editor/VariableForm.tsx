import React from "react"
import styled from "styled-components"
import {
  Input,
  SegmentedControl,
  SegmentedControlButton,
  SelectMenuControl,
  Text,
  TextArea,
} from "../../../../../components"
import type {
  DeclareEntry,
  ListVariable,
  NotebookVariable,
} from "../../../../../store/notebook"
import { withAlpha } from "../../../../../theme"
import type { VariableScope } from "../scope"
import { isQueryList } from "../options/fetchVariableOptions"
import type { VariableOptionsState } from "../useVariableOptions"
import {
  NAME_PROBLEMS,
  PROBLEM_MESSAGES,
  type DraftProblem,
  type VariableDraft,
} from "../variableDrafts"
import { CustomListForm } from "./CustomListForm"
import { ExpressionForm } from "./ExpressionForm"
import { Field, FieldRow, Fields, MonoInput } from "./Field"
import { QueryListForm } from "./QueryListForm"
import { TextForm } from "./TextForm"
import {
  SCOPE_OPTIONS,
  TYPE_OPTIONS,
  variableTypeOf,
  withListSource,
  withVariableType,
  type ListSourceType,
  type VariableType,
} from "./variableTypes"

const NameRow = styled.div`
  position: relative;
`

const At = styled.span`
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
  font-family: ${({ theme }) => theme.fontMonospace};
  color: ${({ theme }) => theme.color.editorSyntaxConstant};
  font-size: 1.4rem;
  font-style: italic;
  line-height: 1;
  pointer-events: none;
  user-select: none;
`

const NameInput = styled(MonoInput)`
  width: 100%;
  padding-left: 1.8rem;
  color: ${({ theme }) => theme.color.editorSyntaxConstant};
  font-style: italic;

  ::placeholder {
    color: ${({ theme }) => withAlpha(theme.color.editorSyntaxConstant, 0.5)};
  }
`

const DescriptionArea = styled(TextArea)`
  height: 3.4rem;
  min-height: 3.4rem;
  padding: 0.7rem 1rem;
  line-height: 1.4;
`

const Problem = styled(Text).attrs({ size: "xs", color: "statusDanger" })``

const Divider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.color.borderSubtle};
`

const SourceToggle = styled(SegmentedControl)`
  background: ${({ theme }) => theme.color.controlTrack};
  align-self: flex-start;
`

type Props = {
  draft: VariableDraft
  problem: DraftProblem | null
  serverError: string | undefined
  entriesAbove: DeclareEntry[]
  declaredAbove: string[]
  hasTimeRange: boolean
  savedOptions: VariableOptionsState | undefined
  onChange: (variable: NotebookVariable) => void
  onScopeChange: (scope: VariableScope) => void
}

type TypeFormProps = {
  variable: NotebookVariable
  problem: DraftProblem | null
  entriesAbove: DeclareEntry[]
  declaredAbove: string[]
  hasTimeRange: boolean
  savedOptions: VariableOptionsState | undefined
  onChange: (variable: NotebookVariable) => void
}

const ListSourceField = ({
  variable,
  onChange,
}: {
  variable: ListVariable
  onChange: (variable: ListVariable) => void
}) => {
  const current = variable.source.type
  const segment = (source: ListSourceType, label: string) => (
    <SegmentedControlButton
      type="button"
      $size="md"
      $active={current === source}
      $activeTone="neutral"
      aria-pressed={current === source}
      onClick={() => onChange(withListSource(variable, source))}
      data-hook={`variable-source-${source}`}
    >
      {label}
    </SegmentedControlButton>
  )
  return (
    <Field label="Values from">
      <SourceToggle role="group" aria-label="Values from">
        {segment("query", "Query")}
        {segment("custom", "Custom values")}
      </SourceToggle>
    </Field>
  )
}

const TypeForm = ({
  variable,
  problem,
  entriesAbove,
  declaredAbove,
  hasTimeRange,
  savedOptions,
  onChange,
}: TypeFormProps) => {
  switch (variable.kind) {
    case "expression":
      return (
        <ExpressionForm
          variable={variable}
          invalid={problem === "emptyValue" || problem === "invalidShape"}
          onChange={onChange}
        />
      )
    case "text":
      return <TextForm variable={variable} onChange={onChange} />
    case "list":
      return (
        <Fields>
          <ListSourceField variable={variable} onChange={onChange} />
          {isQueryList(variable) ? (
            <QueryListForm
              variable={variable}
              problem={problem}
              entriesAbove={entriesAbove}
              declaredAbove={declaredAbove}
              hasTimeRange={hasTimeRange}
              savedOptions={savedOptions}
              onChange={onChange}
            />
          ) : (
            variable.source.type === "custom" && (
              <CustomListForm
                variable={{ ...variable, source: variable.source }}
                invalid={
                  problem === "emptyValues" || problem === "invalidShape"
                }
                onChange={onChange}
              />
            )
          )}
        </Fields>
      )
  }
}

export const VariableForm = ({
  draft,
  problem,
  serverError,
  entriesAbove,
  declaredAbove,
  hasTimeRange,
  savedOptions,
  onChange,
  onScopeChange,
}: Props) => {
  const { variable } = draft
  const message = serverError ?? (problem ? PROBLEM_MESSAGES[problem] : null)

  return (
    <Fields>
      <FieldRow>
        <Field label="Scope">
          <SelectMenuControl
            labelFontSize="1.4rem"
            name="variable-scope"
            value={draft.scope}
            options={SCOPE_OPTIONS}
            onValueChange={(scope) => onScopeChange(scope as VariableScope)}
            dataHook="variable-scope"
          />
        </Field>
        <Field label="Type">
          <SelectMenuControl
            labelFontSize="1.4rem"
            name="variable-type"
            value={variableTypeOf(variable)}
            options={TYPE_OPTIONS}
            onValueChange={(type) =>
              onChange(withVariableType(variable, type as VariableType))
            }
            dataHook="variable-type"
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field
          label="Name"
          required
          hint="Referenced in the queries with @ prefix"
        >
          <NameRow>
            <At>@</At>
            <NameInput
              value={variable.name}
              placeholder="symbol"
              autoComplete="off"
              spellCheck={false}
              variant={
                problem && NAME_PROBLEMS.includes(problem) ? "error" : undefined
              }
              onChange={(e) => onChange({ ...variable, name: e.target.value })}
              data-hook="variable-name"
            />
          </NameRow>
        </Field>
        <Field label="Label" hint="Label to show in the variables bar">
          <Input
            value={variable.label ?? ""}
            onChange={(e) =>
              onChange({ ...variable, label: e.target.value || undefined })
            }
          />
        </Field>
      </FieldRow>
      <Field label="Description">
        <DescriptionArea
          rows={1}
          resize="vertical"
          value={variable.description ?? ""}
          onChange={(e) =>
            onChange({
              ...variable,
              description: e.target.value || undefined,
            })
          }
        />
      </Field>
      <Divider />
      <TypeForm
        variable={variable}
        problem={problem}
        entriesAbove={entriesAbove}
        declaredAbove={declaredAbove}
        hasTimeRange={hasTimeRange}
        savedOptions={savedOptions}
        onChange={onChange}
      />
      {message && <Problem data-hook="variable-problem">{message}</Problem>}
    </Fields>
  )
}
