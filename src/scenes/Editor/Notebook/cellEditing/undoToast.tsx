import React from "react"
import styled from "styled-components"
import { toast } from "../../../../components/Toast"
import { TextButton } from "../../../../components"

type ToastId = ReturnType<typeof toast.success>

const Content = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.2rem;
`

// One undo toast per notebook: a newer change replaces it, and a closing
// notebook takes it away, as its undo would act on an unmounted notebook.
const toastIdByNotebook = new Map<number, ToastId>()

export const dismissUndoToast = (bufferId: number): void => {
  const toastId = toastIdByNotebook.get(bufferId)
  if (toastId === undefined) return
  toastIdByNotebook.delete(bufferId)
  toast.dismiss(toastId)
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
  toastIdByNotebook.set(
    bufferId,
    toast.success(
      <Content>
        <span>{message}</span>
        <TextButton onClick={handleUndo}>Undo</TextButton>
      </Content>,
      { closeOnClick: false },
    ),
  )
}
