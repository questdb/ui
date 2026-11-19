import React from "react"
import styled from "styled-components"
import { AlertDialog, Button, ForwardRef, Overlay } from "../../components"

type Props = {
  open: boolean
  count: number
  // The dialog opens from a menu item that is gone once it closes: focus goes
  // back here instead of the page body.
  returnFocusRef: React.RefObject<HTMLElement>
  onDismiss: () => void
  onConfirm: () => void
}

const DialogHeader = styled.div`
  padding: 1.5rem 2rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.interactionNeutral};
`

export const ClearHistoryDialog = ({
  open,
  count,
  returnFocusRef,
  onDismiss,
  onConfirm,
}: Props) => (
  <AlertDialog.Root
    open={open}
    onOpenChange={(isOpen) => {
      if (!isOpen) onDismiss()
    }}
  >
    <AlertDialog.Portal>
      <ForwardRef>
        <Overlay primitive={AlertDialog.Overlay} />
      </ForwardRef>
      <AlertDialog.Content
        maxwidth="44rem"
        data-hook="clear-history-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocusRef.current?.focus()
        }}
      >
        <DialogHeader>
          <AlertDialog.Title>Delete all closed tabs?</AlertDialog.Title>
        </DialogHeader>
        <AlertDialog.Description>
          This deletes {count} closed {count === 1 ? "tab" : "tabs"} and their
          content. This operation is irreversible.
        </AlertDialog.Description>
        <AlertDialog.ActionButtons>
          <AlertDialog.Cancel asChild>
            <Button variant="secondary" data-hook="clear-history-dismiss">
              Keep
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action asChild>
            <Button
              variant="danger"
              onClick={onConfirm}
              data-hook="clear-history-confirm"
            >
              Delete all
            </Button>
          </AlertDialog.Action>
        </AlertDialog.ActionButtons>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>
)
