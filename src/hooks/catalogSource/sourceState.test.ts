import { describe, expect, it } from "vitest"
import {
  createSourceMachineState,
  MANUAL_RETRY_POLICY,
  nextSourceState,
  POLLING_RETRY_POLICY,
} from "./sourceState"

describe("source state", () => {
  it("keeps the source ready during two transient failures", () => {
    // Given
    const ready = nextSourceState(
      createSourceMachineState("trades"),
      {
        type: "success",
        key: "trades",
        data: "metadata",
      },
      POLLING_RETRY_POLICY,
    )

    // When
    const firstFailure = nextSourceState(
      ready,
      {
        type: "failure",
        key: "trades",
        at: 0,
      },
      POLLING_RETRY_POLICY,
    )
    const secondFailure = nextSourceState(
      firstFailure,
      {
        type: "failure",
        key: "trades",
        at: POLLING_RETRY_POLICY.failureGraceMs,
      },
      POLLING_RETRY_POLICY,
    )

    // Then
    expect(secondFailure.source).toEqual({
      status: "ready",
      data: "metadata",
    })
  })

  it("waits for the grace deadline after three fast failures", () => {
    // Given
    const initial = createSourceMachineState<string>("trades")

    // When
    const first = nextSourceState(
      initial,
      {
        type: "failure",
        key: "trades",
        at: 0,
      },
      POLLING_RETRY_POLICY,
    )
    const second = nextSourceState(
      first,
      {
        type: "failure",
        key: "trades",
        at: 100,
      },
      POLLING_RETRY_POLICY,
    )
    const third = nextSourceState(
      second,
      {
        type: "failure",
        key: "trades",
        at: 200,
      },
      POLLING_RETRY_POLICY,
    )
    const admitted = nextSourceState(
      third,
      {
        type: "failure-deadline",
        key: "trades",
        at: POLLING_RETRY_POLICY.failureGraceMs,
      },
      POLLING_RETRY_POLICY,
    )

    // Then
    expect(third.source.status).toBe("loading")
    expect(admitted.source.status).toBe("unavailable")
  })

  it("admits the third failure after the grace period", () => {
    // Given
    const initial = createSourceMachineState<string>("trades")

    // When
    const first = nextSourceState(
      initial,
      {
        type: "failure",
        key: "trades",
        at: 0,
      },
      POLLING_RETRY_POLICY,
    )
    const second = nextSourceState(
      first,
      {
        type: "failure",
        key: "trades",
        at: 1_000,
      },
      POLLING_RETRY_POLICY,
    )
    const third = nextSourceState(
      second,
      {
        type: "failure",
        key: "trades",
        at: POLLING_RETRY_POLICY.failureGraceMs,
      },
      POLLING_RETRY_POLICY,
    )

    // Then
    expect(third.source.status).toBe("unavailable")
  })

  it("admits the first failure when nothing retries automatically", () => {
    // Given
    const initial = createSourceMachineState<string>("trades")

    // When
    const failed = nextSourceState(
      initial,
      { type: "failure", key: "trades", at: 0 },
      MANUAL_RETRY_POLICY,
    )

    // Then
    expect(failed.source.status).toBe("unavailable")
  })

  it("recovers after one success when nothing retries automatically", () => {
    // Given
    const unavailable = nextSourceState(
      createSourceMachineState<string>("trades"),
      { type: "failure", key: "trades", at: 0 },
      MANUAL_RETRY_POLICY,
    )

    // When
    const recovered = nextSourceState(
      unavailable,
      { type: "success", key: "trades", data: "metadata" },
      MANUAL_RETRY_POLICY,
    )

    // Then
    expect(recovered.source).toEqual({ status: "ready", data: "metadata" })
  })

  it("admits one timed out request", () => {
    // Given
    const initial = createSourceMachineState<string>("trades")

    // When
    const result = nextSourceState(
      initial,
      {
        type: "timeout",
        key: "trades",
      },
      POLLING_RETRY_POLICY,
    )

    // Then
    expect(result.source.status).toBe("unavailable")
  })

  it("requires two consecutive successes to recover", () => {
    // Given
    const unavailable = nextSourceState(
      createSourceMachineState("trades"),
      {
        type: "timeout",
        key: "trades",
      },
      POLLING_RETRY_POLICY,
    )

    // When
    const first = nextSourceState(
      unavailable,
      {
        type: "success",
        key: "trades",
        data: "first",
      },
      POLLING_RETRY_POLICY,
    )
    const second = nextSourceState(
      first,
      {
        type: "success",
        key: "trades",
        data: "second",
      },
      POLLING_RETRY_POLICY,
    )

    // Then
    expect(first.source.status).toBe("unavailable")
    expect(second.source).toEqual({ status: "ready", data: "second" })
  })

  it("resets the failure sequence after a success", () => {
    // Given
    const initial = createSourceMachineState<string>("trades")
    const first = nextSourceState(
      initial,
      {
        type: "failure",
        key: "trades",
        at: 0,
      },
      POLLING_RETRY_POLICY,
    )
    const second = nextSourceState(
      first,
      {
        type: "failure",
        key: "trades",
        at: 1_000,
      },
      POLLING_RETRY_POLICY,
    )

    // When
    const successful = nextSourceState(
      second,
      {
        type: "success",
        key: "trades",
        data: "metadata",
      },
      POLLING_RETRY_POLICY,
    )
    const nextFailure = nextSourceState(
      successful,
      {
        type: "failure",
        key: "trades",
        at: 3_000,
      },
      POLLING_RETRY_POLICY,
    )

    // Then
    expect(nextFailure.source.status).toBe("ready")
    expect(nextFailure.consecutiveFailures).toBe(1)
    expect(nextFailure.firstFailureAt).toBe(3_000)
  })

  it("resets recovery progress after a failure", () => {
    // Given
    const unavailable = nextSourceState(
      createSourceMachineState("trades"),
      {
        type: "timeout",
        key: "trades",
      },
      POLLING_RETRY_POLICY,
    )
    const recovering = nextSourceState(
      unavailable,
      {
        type: "success",
        key: "trades",
        data: "first",
      },
      POLLING_RETRY_POLICY,
    )

    // When
    const failed = nextSourceState(
      recovering,
      {
        type: "failure",
        key: "trades",
        at: 0,
      },
      POLLING_RETRY_POLICY,
    )
    const nextSuccess = nextSourceState(
      failed,
      {
        type: "success",
        key: "trades",
        data: "second",
      },
      POLLING_RETRY_POLICY,
    )

    // Then
    expect(nextSuccess.source.status).toBe("unavailable")
  })

  it("resets all internal state for a new target", () => {
    // Given
    const oldTarget = nextSourceState(
      createSourceMachineState<string>("old"),
      {
        type: "failure",
        key: "old",
        at: 100,
      },
      POLLING_RETRY_POLICY,
    )

    // When
    const newTarget = createSourceMachineState<string>("new")
    const staleOutcome = nextSourceState(
      newTarget,
      {
        type: "failure",
        key: oldTarget.key,
        at: 200,
      },
      POLLING_RETRY_POLICY,
    )

    // Then
    expect(newTarget).toEqual({
      key: "new",
      source: { status: "loading" },
      lastReadyData: null,
      consecutiveFailures: 0,
      firstFailureAt: null,
      consecutiveRecoveries: 0,
    })
    expect(staleOutcome).toBe(newTarget)
  })

  it("ignores cancellations and stale target outcomes", () => {
    // Given
    const initial = createSourceMachineState<string>("new-target")

    // When
    const cancelled = nextSourceState(
      initial,
      {
        type: "cancelled",
        key: "new-target",
      },
      POLLING_RETRY_POLICY,
    )
    const stale = nextSourceState(
      cancelled,
      {
        type: "success",
        key: "old-target",
        data: "stale",
      },
      POLLING_RETRY_POLICY,
    )

    // Then
    expect(stale).toBe(initial)
  })

  it("retains the last ready data after admitted failures", () => {
    // Given
    const ready = nextSourceState(
      createSourceMachineState("trades"),
      {
        type: "success",
        key: "trades",
        data: "metadata",
      },
      POLLING_RETRY_POLICY,
    )

    // When
    const unavailable = nextSourceState(
      ready,
      {
        type: "timeout",
        key: "trades",
      },
      POLLING_RETRY_POLICY,
    )

    // Then
    expect(unavailable.source.status).toBe("unavailable")
    expect(unavailable.lastReadyData).toBe("metadata")
  })

  it("returns to loading for revalidation while retaining fallback data", () => {
    // Given
    const ready = nextSourceState(
      createSourceMachineState("trades"),
      {
        type: "success",
        key: "trades",
        data: "metadata",
      },
      POLLING_RETRY_POLICY,
    )

    // When
    const revalidating = nextSourceState(
      ready,
      {
        type: "revalidate",
        key: "trades",
      },
      POLLING_RETRY_POLICY,
    )

    // Then
    expect(revalidating.source).toEqual({ status: "loading" })
    expect(revalidating.lastReadyData).toBe("metadata")
    expect(revalidating.consecutiveFailures).toBe(0)
    expect(revalidating.firstFailureAt).toBeNull()
    expect(revalidating.consecutiveRecoveries).toBe(0)
  })
})
