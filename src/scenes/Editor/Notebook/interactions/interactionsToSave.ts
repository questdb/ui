import isEqual from "lodash.isequal"
import type {
  CellInteractions,
  NotebookVariable,
} from "../../../../store/notebook"
import type { VariableSlot } from "./InteractionsEditor"

type Draft = {
  interactions?: CellInteractions
  created: Partial<Record<VariableSlot, NotebookVariable>>
}

// A variable created in the drawer for a slot the interactions use.
const createsVariables = ({ interactions, created }: Draft): boolean =>
  (created.click !== undefined && interactions?.click !== undefined) ||
  ((created.from !== undefined || created.to !== undefined) &&
    interactions?.brush !== undefined)

/**
 * The interactions a save stores: the saved ones, the same object, unless
 * the user changed them or created a variable for them.
 */
export const interactionsToSave = (
  saved: CellInteractions | undefined,
  draft: Draft,
): CellInteractions | undefined =>
  !createsVariables(draft) && isEqual(draft.interactions, saved)
    ? saved
    : draft.interactions
