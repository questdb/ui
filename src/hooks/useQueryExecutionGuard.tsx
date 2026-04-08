import React, {
  useState,
  useRef,
  useCallback,
  useContext,
  useMemo,
} from "react"

import { useDispatch, useSelector } from "react-redux"
import {
  Dialog,
  DialogButton,
  DialogDescription,
  ForwardRef,
  Overlay,
  Text,
} from "../components"
import { QuestContext } from "../providers"
import { actions, selectors } from "../store"
import type { NotificationNamespaceKey, QueryKey } from "../store/Query/types"

type PendingAction = {
  bufferId: NotificationNamespaceKey
  queryKey: QueryKey
  execute: () => void
}

export type QueryExecutionGuard = {
  requestExecution: (
    bufferId: NotificationNamespaceKey,
    queryKey: QueryKey,
    execute: () => void,
  ) => void
  releaseExecution: (queryKey: QueryKey) => void
  isAnyQueryRunning: boolean
  runningQueryKey: QueryKey | null
  confirmationDialog: React.ReactNode
}

export const useQueryExecutionGuard = (): QueryExecutionGuard => {
  const dispatch = useDispatch()
  const { quest } = useContext(QuestContext)
  const activeQueryExecution = useSelector(
    selectors.query.getActiveQueryExecution,
  )
  const activeQueryExecutionRef = useRef(activeQueryExecution)
  activeQueryExecutionRef.current = activeQueryExecution

  const [dialogOpen, setDialogOpen] = useState(false)
  const pendingActionRef = useRef<PendingAction | undefined>(undefined)

  const requestExecution = useCallback(
    (
      bufferId: NotificationNamespaceKey,
      queryKey: QueryKey,
      execute: () => void,
    ): void => {
      if (!activeQueryExecutionRef.current) {
        dispatch(actions.query.startQueryExecution({ bufferId, queryKey }))
        execute()
        return
      }

      pendingActionRef.current = { bufferId, queryKey, execute }
      setDialogOpen(true)
    },
    [dispatch],
  )

  const releaseExecution = useCallback(
    (queryKey: QueryKey) => {
      if (activeQueryExecutionRef.current?.queryKey === queryKey) {
        dispatch(actions.query.stopQueryExecution())
      }
    },
    [dispatch],
  )

  const handleDismiss = useCallback(() => {
    pendingActionRef.current = undefined
    setDialogOpen(false)
  }, [])

  const handleConfirm = useCallback(() => {
    setDialogOpen(false)
    quest.abort()

    const pending = pendingActionRef.current
    pendingActionRef.current = undefined
    if (pending) {
      // Replace the active execution with the pending one before executing
      dispatch(
        actions.query.startQueryExecution({
          bufferId: pending.bufferId,
          queryKey: pending.queryKey,
        }),
      )
      // Let the abort settle before executing the pending action
      setTimeout(() => pending.execute(), 0)
    } else {
      dispatch(actions.query.stopQueryExecution())
    }
  }, [quest, dispatch])

  const confirmationDialog = useMemo(
    () => (
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
                A query is currently running. Starting a new query will cancel
                the current execution.
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
    ),
    [dialogOpen, handleDismiss, handleConfirm],
  )

  return {
    requestExecution,
    releaseExecution,
    isAnyQueryRunning: activeQueryExecution !== null,
    runningQueryKey:
      activeQueryExecution !== null ? activeQueryExecution.queryKey : null,
    confirmationDialog,
  }
}
