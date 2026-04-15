import type { Client } from "./client"
import type { QueryKey } from "../../store/Query/types"

type NotificationNamespaceKey = string | number

export type ActiveExecution = {
  bufferId: NotificationNamespaceKey
  queryKey: QueryKey
}

type PendingExecution = ActiveExecution & {
  execute: () => void
}

export type QueryExecutionSnapshot = {
  active: ActiveExecution | null
  pending: ActiveExecution | null
  dialogOpen: boolean
}

export class QueryExecutionManager {
  private _active: ActiveExecution | null = null
  private _pending: PendingExecution | null = null
  private _dialogOpen = false
  private _listeners = new Set<() => void>()
  private _snapshot: QueryExecutionSnapshot = {
    active: null,
    pending: null,
    dialogOpen: false,
  }

  private _idleWaiters: Array<() => void> = []

  constructor(private client: Client) {}

  private waitForIdle(): Promise<void> {
    if (this._active === null) return Promise.resolve()
    return new Promise((resolve) => {
      this._idleWaiters.push(resolve)
    })
  }

  private flushIdleWaiters() {
    if (this._idleWaiters.length === 0) return
    const waiters = this._idleWaiters
    this._idleWaiters = []
    waiters.forEach((resolve) => resolve())
  }

  requestExecution = (
    bufferId: NotificationNamespaceKey,
    queryKey: QueryKey,
    execute: () => void,
  ): void => {
    if (this._active === null) {
      this._active = { bufferId, queryKey }
      this.refreshSnapshot()
      execute()
      return
    }

    this._pending = { bufferId, queryKey, execute }
    this._dialogOpen = true
    this.refreshSnapshot()
  }

  releaseExecution = (queryKey: QueryKey): void => {
    if (this._active?.queryKey !== queryKey) return
    this._active = null
    this.refreshSnapshot()
    this.flushIdleWaiters()
  }

  // Mark a query as active without going through the confirmation dialog.
  // Idempotent for the same key. Used by code paths that start queries
  // outside of requestExecution (e.g. the Run button which dispatches
  // toggleRunning directly), so that subsequent requestExecution calls can
  // still detect the conflict.
  markActive = (
    bufferId: NotificationNamespaceKey,
    queryKey: QueryKey,
  ): void => {
    if (
      this._active?.queryKey === queryKey &&
      this._active?.bufferId === bufferId
    ) {
      return
    }
    this._active = { bufferId, queryKey }
    this.refreshSnapshot()
  }

  cancelActive = (): void => {
    if (this._active === null) return
    this.client.abortActive()
    this._active = null
    this.refreshSnapshot()
    this.flushIdleWaiters()
  }

  confirmPending = async (): Promise<void> => {
    const pending = this._pending
    if (pending === null) {
      this._dialogOpen = false
      this.refreshSnapshot()
      return
    }

    this._pending = null
    this._dialogOpen = false
    this.refreshSnapshot()

    // Wait for the aborted query's .catch/.finally to call releaseExecution
    // (which also dispatches stopRunning in its handler) before starting the
    // pending query. Otherwise execute() can fire toggleRunning(QUERY) while
    // running is still QUERY, producing a no-op useEffect.
    const idle = this.waitForIdle()
    this.client.abortActive()
    await idle

    this._active = { bufferId: pending.bufferId, queryKey: pending.queryKey }
    this.refreshSnapshot()
    pending.execute()
  }

  dismissPending = (): void => {
    this._pending = null
    this._dialogOpen = false
    this.refreshSnapshot()
  }

  getActive = (): ActiveExecution | null => this._active

  getPending = (): ActiveExecution | null =>
    this._pending === null
      ? null
      : { bufferId: this._pending.bufferId, queryKey: this._pending.queryKey }

  isDialogOpen = (): boolean => this._dialogOpen

  isAnyRunning = (): boolean => this._active !== null

  runningQueryKey = (): QueryKey | null => this._active?.queryKey ?? null

  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener)
    return () => {
      this._listeners.delete(listener)
    }
  }

  getSnapshot = (): QueryExecutionSnapshot => this._snapshot

  private refreshSnapshot() {
    this._snapshot = {
      active: this._active,
      pending: this.getPending(),
      dialogOpen: this._dialogOpen,
    }
    this._listeners.forEach((listener) => listener())
  }
}
