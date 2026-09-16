import React from "react"
import styled from "styled-components"
import { trackEvent } from "../../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../../modules/ConsoleEventTracker/events"
import type {
  ListVariable,
  NotebookVariable,
} from "../../../../../store/notebook"
import {
  useNotebookActions,
  useNotebookVariablesState,
} from "../../NotebookProvider"
import {
  useGlobalVariablesActions,
  useGlobalVariablesState,
} from "../globals/GlobalVariablesProvider"
import { customListOptions } from "../listOptions"
import { effectiveVariables, type VariableScope } from "../scope"
import { isQueryList } from "../options/fetchVariableOptions"
import { listOptionsState } from "../declareEntries"
import { ListPicker } from "./ListPicker"
import { TextPicker } from "./TextPicker"

const Bar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.8rem 2rem;
  padding: 0.8rem 2rem;
  background: ${({ theme }) => theme.color.surfaceBase};
  border-bottom: 1px solid ${({ theme }) => theme.color.borderSubtle};
  flex-shrink: 0;
`

const Picker = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
`

export const VariablesBar: React.FC = () => {
  const { settings, listOptions } = useNotebookVariablesState()
  const { updateVariable, refreshVariableOptions } = useNotebookActions()
  const { variables: globalVariables, listOptions: globalListOptions } =
    useGlobalVariablesState()
  const globals = useGlobalVariablesActions()
  const pickers = effectiveVariables(
    globalVariables,
    settings.variables ?? [],
  ).filter(({ variable }) => variable.kind !== "expression")

  if (pickers.length === 0) return null

  const update = (
    scope: VariableScope,
    name: string,
    updater: (current: NotebookVariable) => NotebookVariable,
  ) => {
    if (scope === "global") {
      globals.updateVariable(name, updater)
    } else {
      updateVariable(name, updater)
    }
  }

  const selectList = (
    scope: VariableScope,
    variable: ListVariable,
    selected: ListVariable["selected"],
  ) => {
    void trackEvent(ConsoleEvent.NOTEBOOK_VARIABLE_SELECT, {
      kind: "list",
      multi: variable.multi,
      scope,
    })
    update(scope, variable.name, (current) =>
      current.kind === "list" ? { ...current, selected } : current,
    )
  }

  const setText = (scope: VariableScope, name: string, value: string) => {
    void trackEvent(ConsoleEvent.NOTEBOOK_VARIABLE_SELECT, {
      kind: "text",
      scope,
    })
    update(scope, name, (current) =>
      current.kind === "text" ? { ...current, value } : current,
    )
  }

  const renderList = (scope: VariableScope, variable: ListVariable) => {
    if (isQueryList(variable)) {
      const options = scope === "global" ? globalListOptions : listOptions
      return (
        <ListPicker
          variable={variable}
          options={listOptionsState(options, variable.name)?.options ?? []}
          status={listOptionsState(options, variable.name)}
          onChange={(selected) => selectList(scope, variable, selected)}
          onRefresh={() =>
            scope === "global"
              ? globals.refreshOptions(variable.name)
              : refreshVariableOptions(variable.name)
          }
        />
      )
    }
    return (
      <ListPicker
        variable={variable}
        options={customListOptions(variable)}
        onChange={(selected) => selectList(scope, variable, selected)}
      />
    )
  }

  return (
    <Bar data-hook="notebook-variables-bar">
      {pickers.map(({ variable, scope }) => (
        <Picker key={`${scope}:${variable.name}`} data-scope={scope}>
          {variable.kind === "text" && (
            <TextPicker
              variable={variable}
              onChange={(value) => setText(scope, variable.name, value)}
            />
          )}
          {variable.kind === "list" && renderList(scope, variable)}
        </Picker>
      ))}
    </Bar>
  )
}
