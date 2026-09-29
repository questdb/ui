import React from "react"
import { AlertDialog, Button } from "../../../../../components"
import type { GlobalReference } from "../globals/globalReferences"
import { ScopeChangeDialog } from "./ScopeChangeDialog"

export type DemotionChoice = "copy" | "drop"

type Props = {
  references: GlobalReference[]
  onCancel: () => void
  onChoose: (choice: DemotionChoice) => void
}

export const DemoteGlobalsDialog: React.FC<Props> = ({
  references,
  onCancel,
  onChoose,
}) => (
  <ScopeChangeDialog
    title="Other notebooks use these variables"
    message="Removing them from all notebooks breaks the cells that reference them. Copy them into those notebooks as local variables, or remove them anyway."
    affected={references}
    dataHook="demote-globals-dialog"
    onCancel={onCancel}
    actions={
      <>
        <AlertDialog.Action asChild>
          <Button
            variant="danger"
            onClick={() => onChoose("drop")}
            data-hook="demote-globals-drop"
          >
            Remove anyway
          </Button>
        </AlertDialog.Action>
        <AlertDialog.Action asChild>
          <Button
            variant="primary"
            onClick={() => onChoose("copy")}
            data-hook="demote-globals-copy"
          >
            Copy to those notebooks
          </Button>
        </AlertDialog.Action>
      </>
    }
  />
)
