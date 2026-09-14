import type { NotebookVariable } from "../../../../store/notebook"

export type VariableScope = "notebook" | "global"

export type ScopedVariable = {
  variable: NotebookVariable
  scope: VariableScope
}

export const declaresName = (
  variables: NotebookVariable[],
  name: string,
): boolean => variables.some((variable) => variable.name === name)

export const effectiveVariables = (
  globals: NotebookVariable[],
  local: NotebookVariable[],
): ScopedVariable[] => [
  ...globals
    .filter((variable) => !declaresName(local, variable.name))
    .map((variable) => ({ variable, scope: "global" as const })),
  ...local.map((variable) => ({ variable, scope: "notebook" as const })),
]
