import React from "react"
import styled from "styled-components"
import { AlertDialog, Button, ForwardRef, Overlay } from "../../components"
import type { QueryActivityRow } from "./queryActivity"

type Props = {
  row: QueryActivityRow | null
  onDismiss: () => void
  onConfirm: () => void
}

const DialogHeader = styled.div`
  padding: 1.5rem 2rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.interactionNeutral};
`

export const CancelQueryDialog = ({ row, onDismiss, onConfirm }: Props) => (
  <AlertDialog.Root
    open={row !== null}
    onOpenChange={(open) => {
      if (!open) onDismiss()
    }}
  >
    <AlertDialog.Portal>
      <ForwardRef>
        <Overlay primitive={AlertDialog.Overlay} />
      </ForwardRef>
      <AlertDialog.Content
        maxwidth="44rem"
        data-hook="query-activity-cancel-dialog"
      >
        <DialogHeader>
          <AlertDialog.Title>
            Cancel query {row?.queryId.toString()}?
          </AlertDialog.Title>
        </DialogHeader>
        <AlertDialog.Description>
          A cancel request will be sent for this query. This operation is
          irreversible.
        </AlertDialog.Description>
        <AlertDialog.ActionButtons>
          <AlertDialog.Cancel asChild>
            <Button
              variant="secondary"
              data-hook="query-activity-cancel-dismiss"
            >
              Keep
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action asChild>
            <Button
              variant="danger"
              onClick={onConfirm}
              data-hook="query-activity-cancel-confirm"
            >
              Cancel query
            </Button>
          </AlertDialog.Action>
        </AlertDialog.ActionButtons>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>
)
