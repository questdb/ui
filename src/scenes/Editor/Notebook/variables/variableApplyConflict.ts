import type {
  NotebookSettings,
  NotebookVariable,
  TimeRange,
} from "../../../../store/notebook"
import { sameTimeRange } from "./timeRange"
import { variablesEqual } from "./variableChanges"

export const VARIABLES_UPDATED_MESSAGE =
  "Variables updated while this dialog was open. Reload them before applying."

export class VariablesUpdatedError extends Error {
  constructor() {
    super(VARIABLES_UPDATED_MESSAGE)
    this.name = "VariablesUpdatedError"
  }
}

export type VariableApplyBaseline = {
  localVariables: NotebookVariable[]
  timeRange: TimeRange | undefined
  globalRevision: number
}

export const assertNotebookVariablesUnchanged = (
  settings: NotebookSettings,
  baseline: VariableApplyBaseline,
): void => {
  if (
    !variablesEqual(settings.variables ?? [], baseline.localVariables) ||
    !sameTimeRange(settings.timeRange, baseline.timeRange)
  ) {
    throw new VariablesUpdatedError()
  }
}
