import React from "react"
import styled from "styled-components"
import { toast } from "../../../../components/Toast"
import { TextButton } from "../../../../components"
import { onUndoHistoryCleared } from "../undo/notebookUndoHistory"

type ToastId = ReturnType<typeof toast.success>

const Content = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.2rem;
`

const UndoButton = styled(TextButton)`
  flex-shrink: 0;
  white-space: nowrap;
`

// One undo toast per notebook: a newer change replaces it, and a closing
// notebook takes it away, as its undo would act on an unmounted notebook. A
// cleared history (an agent edit) also takes it away: its Undo would have
// nothing left to step.
const toastByNotebook = new Map<
  number,
  { toastId: ToastId; stopWatchingClear: () => void }
>()

export const dismissUndoToast = (bufferId: number): void => {
  const shown = toastByNotebook.get(bufferId)
  if (shown === undefined) return
  toastByNotebook.delete(bufferId)
  shown.stopWatchingClear()
  toast.dismiss(shown.toastId)
}

export const showUndoToast = (
  bufferId: number,
  message: string,
  onUndo: () => void,
): void => {
  dismissUndoToast(bufferId)
  const handleUndo = () => {
    dismissUndoToast(bufferId)
    onUndo()
  }
  const toastId = toast.success(
    <Content>
      <span>{message}</span>
      <UndoButton onClick={handleUndo}>Undo</UndoButton>
    </Content>,
    { closeOnClick: false },
  )
  toastByNotebook.set(bufferId, {
    toastId,
    stopWatchingClear: onUndoHistoryCleared(bufferId, () =>
      dismissUndoToast(bufferId),
    ),
  })
}
