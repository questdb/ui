import type { SourceState } from "./types"

export const SOURCE_TIMEOUT_MS = 10_000

export type SourceRetryPolicy = {
  failureThreshold: number
  failureGraceMs: number
  recoveryThreshold: number
}

export const POLLING_RETRY_POLICY: SourceRetryPolicy = {
  failureThreshold: 3,
  failureGraceMs: 2_000,
  recoveryThreshold: 2,
}

export const MANUAL_RETRY_POLICY: SourceRetryPolicy = {
  failureThreshold: 1,
  failureGraceMs: 0,
  recoveryThreshold: 1,
}

export type SourceMachineState<T> = {
  key: string
  source: SourceState<T>
  lastReadyData: T | null
  consecutiveFailures: number
  firstFailureAt: number | null
  consecutiveRecoveries: number
}

export type SourceOutcome<T> =
  | { type: "success"; key: string; data: T }
  | { type: "revalidate"; key: string }
  | { type: "failure"; key: string; at: number }
  | { type: "failure-deadline"; key: string; at: number }
  | { type: "timeout"; key: string }
  | { type: "cancelled"; key: string }

export const createSourceMachineState = <T>(
  key: string,
): SourceMachineState<T> => ({
  key,
  source: { status: "loading" },
  lastReadyData: null,
  consecutiveFailures: 0,
  firstFailureAt: null,
  consecutiveRecoveries: 0,
})

const unavailableState = <T>(
  state: SourceMachineState<T>,
): SourceMachineState<T> => ({
  ...state,
  source: { status: "unavailable" },
  consecutiveRecoveries: 0,
})

const hasExhaustedFailures = <T>(
  state: SourceMachineState<T>,
  at: number,
  policy: SourceRetryPolicy,
): boolean =>
  state.consecutiveFailures >= policy.failureThreshold &&
  state.firstFailureAt !== null &&
  at - state.firstFailureAt >= policy.failureGraceMs

export const nextSourceState = <T>(
  state: SourceMachineState<T>,
  outcome: SourceOutcome<T>,
  policy: SourceRetryPolicy,
): SourceMachineState<T> => {
  if (outcome.key !== state.key || outcome.type === "cancelled") {
    return state
  }

  if (outcome.type === "revalidate") {
    return {
      ...createSourceMachineState<T>(state.key),
      lastReadyData: state.lastReadyData,
    }
  }

  if (outcome.type === "timeout") {
    return unavailableState(state)
  }

  if (outcome.type === "success") {
    if (state.source.status === "unavailable") {
      const consecutiveRecoveries = state.consecutiveRecoveries + 1
      if (consecutiveRecoveries < policy.recoveryThreshold) {
        return {
          ...state,
          consecutiveFailures: 0,
          firstFailureAt: null,
          consecutiveRecoveries,
        }
      }
    }

    return {
      ...state,
      source: { status: "ready", data: outcome.data },
      lastReadyData: outcome.data,
      consecutiveFailures: 0,
      firstFailureAt: null,
      consecutiveRecoveries: 0,
    }
  }

  if (outcome.type === "failure-deadline") {
    return hasExhaustedFailures(state, outcome.at, policy)
      ? unavailableState(state)
      : state
  }

  const failedState: SourceMachineState<T> = {
    ...state,
    consecutiveFailures: state.consecutiveFailures + 1,
    firstFailureAt: state.firstFailureAt ?? outcome.at,
    consecutiveRecoveries: 0,
  }

  return hasExhaustedFailures(failedState, outcome.at, policy)
    ? unavailableState(failedState)
    : failedState
}
