import React, { useContext } from "react"
import {
  Dialog,
  DialogButton,
  DialogDescription,
  ForwardRef,
  Overlay,
  Text,
} from "../"
import { QuestContext } from "../../providers"
import { useQueryExecutionState } from "../../hooks/useQueryExecutionState"

export const QueryExecutionConfirmDialog: React.FC = () => {
  const { questExecution } = useContext(QuestContext)
  const { dialogOpen } = useQueryExecutionState()

  const handleDismiss = () => questExecution.dismissPending()
  const handleConfirm = () => questExecution.confirmPending()

  return (
    <Dialog.Root
      open={dialogOpen}
      onOpenChange={(open) => {
        if (!open) handleDismiss()
      }}
    >
      <Dialog.Portal>
        <ForwardRef>
          <Overlay primitive={Dialog.Overlay} />
        </ForwardRef>

        <Dialog.Content
          onEscapeKeyDown={handleDismiss}
          onInteractOutside={handleDismiss}
          data-hook="abort-confirmation-dialog"
        >
          <Dialog.Title>Cancel current query?</Dialog.Title>

          <DialogDescription>
            <Text color="foreground">
              A query is currently running. Starting a new query will cancel the
              current execution.
            </Text>
          </DialogDescription>

          <Dialog.ActionButtons>
            <Dialog.Close asChild>
              <DialogButton
                skin="secondary"
                data-hook="abort-confirmation-dialog-dismiss"
                onClick={handleDismiss}
              >
                Dismiss
              </DialogButton>
            </Dialog.Close>

            <DialogButton
              skin="primary"
              data-hook="abort-confirmation-dialog-confirm"
              onClick={handleConfirm}
            >
              Cancel current query
            </DialogButton>
          </Dialog.ActionButtons>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
