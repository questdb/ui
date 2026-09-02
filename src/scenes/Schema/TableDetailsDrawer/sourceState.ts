import type { SourceState } from "./types"

export const SOURCE_FAILURE_THRESHOLD = 3
export const SOURCE_FAILURE_GRACE_MS = 2_000
const SOURCE_RECOVERY_THRESHOLD = 2
export const SOURCE_TIMEOUT_MS = 10_000

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

export const nextSourceState = <T>(
  state: SourceMachineState<T>,
  outcome: SourceOutcome<T>,
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
      if (consecutiveRecoveries < SOURCE_RECOVERY_THRESHOLD) {
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
    const failureWindowElapsed =
      state.firstFailureAt !== null &&
      outcome.at - state.firstFailureAt >= SOURCE_FAILURE_GRACE_MS
    return state.consecutiveFailures >= SOURCE_FAILURE_THRESHOLD &&
      failureWindowElapsed
      ? unavailableState(state)
      : state
  }

  const firstFailureAt = state.firstFailureAt ?? outcome.at
  const consecutiveFailures = state.consecutiveFailures + 1
  const failureWindowElapsed =
    outcome.at - firstFailureAt >= SOURCE_FAILURE_GRACE_MS

  const failedState: SourceMachineState<T> = {
    ...state,
    consecutiveFailures,
    firstFailureAt,
    consecutiveRecoveries: 0,
  }

  return consecutiveFailures >= SOURCE_FAILURE_THRESHOLD && failureWindowElapsed
    ? unavailableState(failedState)
    : failedState
}
