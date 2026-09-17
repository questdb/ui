import type { NotebookVariable } from "../../../../store/notebook"

export type VariableScope = "notebook" | "global"

export type ScopedVariable = {
  variable: NotebookVariable
  scope: VariableScope
}

export const effectiveVariables = (
  globals: NotebookVariable[],
  local: NotebookVariable[],
): ScopedVariable[] => [
  ...globals.map((variable) => ({ variable, scope: "global" as const })),
  ...local.map((variable) => ({ variable, scope: "notebook" as const })),
]
