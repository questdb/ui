import type { QueryKey } from "../../store/Query/types"

type NotificationNamespaceKey = string | number
type ScopeKey = string

export const DEFAULT_QUERY_EXECUTION_SCOPE: ScopeKey = "query-execution"

export type ActiveExecution = {
  scopeKey: ScopeKey
  bufferId: NotificationNamespaceKey
  queryKey: QueryKey
  abort: () => void
}

type PendingExecution = ActiveExecution & {
  execute: () => void
  onDismiss?: () => void
}

export type QueryExecutionRequest = {
  abort: () => void
  bufferId: NotificationNamespaceKey
  execute: () => void
  onDismiss?: () => void
  queryKey: QueryKey
  scopeKey?: ScopeKey
}

export type QueryExecutionSnapshot = {
  active: ActiveExecution | null
  pending: ActiveExecution | null
  dialogOpen: boolean
}

export class QueryExecutionManager {
  private _activeByScope = new Map<ScopeKey, ActiveExecution>()
  private _pendingByScope = new Map<ScopeKey, PendingExecution>()
  private _dialogScopeKey: ScopeKey | null = null
  private _listeners = new Set<() => void>()
  private _snapshot: QueryExecutionSnapshot = {
    active: null,
    pending: null,
    dialogOpen: false,
  }

  private _idleWaiters = new Map<ScopeKey, Array<() => void>>()

  private waitForIdle(scopeKey: ScopeKey): Promise<void> {
    if (!this._activeByScope.has(scopeKey)) return Promise.resolve()
    return new Promise((resolve) => {
      const waiters = this._idleWaiters.get(scopeKey) ?? []
      waiters.push(resolve)
      this._idleWaiters.set(scopeKey, waiters)
    })
  }

  private flushIdleWaiters(scopeKey: ScopeKey) {
    const waiters = this._idleWaiters.get(scopeKey)
    if (!waiters || waiters.length === 0) return
    this._idleWaiters.delete(scopeKey)
    waiters.forEach((resolve) => resolve())
  }

  requestExecution = (request: QueryExecutionRequest): void => {
    const scopeKey = request.scopeKey ?? DEFAULT_QUERY_EXECUTION_SCOPE
    if (!this._activeByScope.has(scopeKey)) {
      this._activeByScope.set(scopeKey, {
        scopeKey,
        bufferId: request.bufferId,
        queryKey: request.queryKey,
        abort: request.abort,
      })
      this.refreshSnapshot()
      request.execute()
      return
    }

    if (this._dialogScopeKey && this._dialogScopeKey !== scopeKey) {
      this._pendingByScope.get(this._dialogScopeKey)?.onDismiss?.()
      this._pendingByScope.delete(this._dialogScopeKey)
    }

    this._pendingByScope.get(scopeKey)?.onDismiss?.()
    this._pendingByScope.set(scopeKey, {
      scopeKey,
      bufferId: request.bufferId,
      queryKey: request.queryKey,
      execute: request.execute,
      abort: request.abort,
      onDismiss: request.onDismiss,
    })
    this._dialogScopeKey = scopeKey
    this.refreshSnapshot()
  }

  releaseExecution = (
    queryKey: QueryKey,
    scopeKey: ScopeKey = DEFAULT_QUERY_EXECUTION_SCOPE,
  ): void => {
    if (this._activeByScope.get(scopeKey)?.queryKey !== queryKey) return
    this._activeByScope.delete(scopeKey)
    this.refreshSnapshot()
    this.flushIdleWaiters(scopeKey)
  }

  // Mark a query as active without going through the confirmation dialog.
  // Idempotent for the same key. Used by legacy code paths that start queries
  // outside of requestExecution (e.g. the Run button which dispatches
  // toggleRunning directly), so that subsequent requestExecution calls can
  // still detect the conflict.
  markActive = (
    bufferId: NotificationNamespaceKey,
    queryKey: QueryKey,
    abort: () => void,
    scopeKey: ScopeKey = DEFAULT_QUERY_EXECUTION_SCOPE,
  ): void => {
    const active = this._activeByScope.get(scopeKey)
    if (active?.queryKey === queryKey && active?.bufferId === bufferId) {
      if (abort && active.abort !== abort) {
        this._activeByScope.set(scopeKey, { ...active, abort })
        this.refreshSnapshot()
      }
      return
    }
    this._activeByScope.set(scopeKey, {
      scopeKey,
      bufferId,
      queryKey,
      abort,
    })
    this.refreshSnapshot()
  }

  rekeyActive = (
    oldKey: QueryKey,
    newKey: QueryKey,
    scopeKey: ScopeKey = DEFAULT_QUERY_EXECUTION_SCOPE,
  ): void => {
    const active = this._activeByScope.get(scopeKey)
    if (!active || active.queryKey !== oldKey) return
    this._activeByScope.set(scopeKey, { ...active, queryKey: newKey })
    this.refreshSnapshot()
  }

  private abortActive(scopeKey: ScopeKey): void {
    const active = this._activeByScope.get(scopeKey)
    if (!active) return
    active.abort()
  }

  abortActiveByScope = (
    scopeKey: ScopeKey = DEFAULT_QUERY_EXECUTION_SCOPE,
  ): void => {
    if (!this._activeByScope.has(scopeKey)) return
    this.abortActive(scopeKey)
    this._activeByScope.delete(scopeKey)
    this.refreshSnapshot()
    this.flushIdleWaiters(scopeKey)
  }

  cancelActive = (): void => this.abortActiveByScope()

  confirmPending = async (): Promise<void> => {
    const scopeKey = this._dialogScopeKey
    const pending = scopeKey ? this._pendingByScope.get(scopeKey) : null
    if (!scopeKey || !pending) {
      this._dialogScopeKey = null
      this.refreshSnapshot()
      return
    }

    this._pendingByScope.delete(scopeKey)
    this._dialogScopeKey = null
    this.refreshSnapshot()

    // Wait for the aborted query's .catch/.finally to call releaseExecution
    // (which also dispatches stopRunning in its handler) before starting the
    // pending query. Otherwise execute() can fire toggleRunning(QUERY) while
    // running is still QUERY, producing a no-op useEffect.
    const idle = this.waitForIdle(scopeKey)
    this.abortActive(scopeKey)
    await idle

    this._activeByScope.set(scopeKey, {
      scopeKey,
      bufferId: pending.bufferId,
      queryKey: pending.queryKey,
      abort: pending.abort,
    })
    this.refreshSnapshot()
    pending.execute()
  }

  dismissPending = (scopeKey?: ScopeKey): void => {
    const targetScopeKey = scopeKey ?? this._dialogScopeKey
    if (!targetScopeKey) return
    this._pendingByScope.get(targetScopeKey)?.onDismiss?.()
    this._pendingByScope.delete(targetScopeKey)
    if (this._dialogScopeKey === targetScopeKey) {
      this._dialogScopeKey = null
    }
    this.refreshSnapshot()
  }

  getActive = (
    scopeKey: ScopeKey = DEFAULT_QUERY_EXECUTION_SCOPE,
  ): ActiveExecution | null => this._activeByScope.get(scopeKey) ?? null

  getPending = (scopeKey?: ScopeKey): ActiveExecution | null => {
    const targetScopeKey = scopeKey ?? this._dialogScopeKey
    const pending = targetScopeKey
      ? this._pendingByScope.get(targetScopeKey)
      : null
    return pending === undefined || pending === null
      ? null
      : {
          scopeKey: pending.scopeKey,
          bufferId: pending.bufferId,
          queryKey: pending.queryKey,
          abort: pending.abort,
        }
  }

  isDialogOpen = (): boolean => this._dialogScopeKey !== null

  isAnyRunning = (
    scopeKey: ScopeKey = DEFAULT_QUERY_EXECUTION_SCOPE,
  ): boolean => this._activeByScope.has(scopeKey)

  runningQueryKey = (
    scopeKey: ScopeKey = DEFAULT_QUERY_EXECUTION_SCOPE,
  ): QueryKey | null => this.getActive(scopeKey)?.queryKey ?? null

  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener)
    return () => {
      this._listeners.delete(listener)
    }
  }

  getSnapshot = (): QueryExecutionSnapshot => this._snapshot

  private refreshSnapshot() {
    this._snapshot = {
      active: this.getActive(),
      pending: this.getPending(),
      dialogOpen: this.isDialogOpen(),
    }
    this._listeners.forEach((listener) => listener())
  }
}
