import React from "react"
import { AlertDialog, Button } from "../../../../../components"
import type { GlobalNameConflict } from "../globals/globalNameConflict"
import { ScopeChangeDialog } from "./ScopeChangeDialog"

type Props = {
  conflicts: GlobalNameConflict[]
  onCancel: () => void
  onConfirm: () => void
}

export const OverrideLocalsDialog: React.FC<Props> = ({
  conflicts,
  onCancel,
  onConfirm,
}) => (
  <ScopeChangeDialog
    title="Override local variables?"
    message="Other notebooks define these variables locally. Making them global removes the local definitions and their values."
    affected={conflicts}
    dataHook="override-locals-dialog"
    onCancel={onCancel}
    actions={
      <AlertDialog.Action asChild>
        <Button
          variant="danger"
          onClick={onConfirm}
          data-hook="override-locals-confirm"
        >
          Override
        </Button>
      </AlertDialog.Action>
    }
  />
)
