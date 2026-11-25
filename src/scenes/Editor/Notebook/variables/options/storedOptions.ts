import type { StoredVariableOptions } from "../../../../../store/notebookOptions"
import type { ListOptionsByName } from "../declareEntries"

export const listOptionsFromStored = (
  rows: StoredVariableOptions[],
): ListOptionsByName =>
  Object.fromEntries(rows.map((row) => [row.name, { options: row.options }]))
