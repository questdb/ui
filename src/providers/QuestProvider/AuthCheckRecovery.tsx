import React, { useCallback, useEffect, useRef, useState } from "react"
import { ConnectionErrorView } from "../../components/ConnectionErrorView"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import {
  endedFor,
  isAuthRefreshUnavailable,
} from "../../modules/OAuth2/session"
import { isCancelledByUser } from "../../utils/questdb/cancellation"
import { questClient } from "../../utils/questdb/queryClient"
import type { ErrorResult } from "../../utils/questdb/types"

export type AuthCheckFailure = { message: string; renewalUnavailable: boolean }

export const useAuthCheck = (required: boolean) => {
  const [finished, setFinished] = useState(!required)
  const [error, setError] = useState<AuthCheckFailure>()
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const mounted = useRef(false)
  const consoleRef = useRef<HTMLElement>(null)
  const focusAfterRetry = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!finished || !focusAfterRetry.current || !consoleRef.current) return
    focusAfterRetry.current = false
    const main = consoleRef.current
    // A permanent tabindex makes blank clicks anywhere in the console focus
    // main, breaking native keyboard scrolling in nested, non-focusable panels.
    main.setAttribute("tabindex", "-1")
    const releaseFocusTarget = () => main.removeAttribute("tabindex")
    main.addEventListener("blur", releaseFocusTarget, { once: true })
    main.focus()
    return () => {
      main.removeEventListener("blur", releaseFocusTarget)
      releaseFocusTarget()
    }
  }, [finished])

  const finish = useCallback(async (userRetry = false) => {
    if (inFlight.current) return
    inFlight.current = true
    const session = authSessionState.capture()
    setPending(true)
    try {
      // Retry renews the session at once, or waits for a renewal still in
      // flight, instead of failing with the same error during the backoff.
      if (userRetry) {
        await questClient.prepareRenewalRetry()
        if (!mounted.current || !session.isCurrent()) return
      }
      await questClient.queryRaw("SELECT 1", { background: true })
      if (mounted.current && session.isCurrent()) setFinished(true)
    } catch (failure) {
      if (
        mounted.current &&
        !endedFor(session, failure) &&
        !isCancelledByUser(failure)
      ) {
        const renewalUnavailable = isAuthRefreshUnavailable(failure)
        setError({
          renewalUnavailable,
          message: renewalUnavailable
            ? "The identity provider could not renew your SSO session. Retry to renew it, or sign in again."
            : (failure as Partial<ErrorResult>)?.error ||
              "Could not connect to QuestDB.",
        })
      }
    } finally {
      inFlight.current = false
      if (mounted.current && session.isCurrent()) setPending(false)
    }
  }, [])

  const retry = () => {
    if (pending) return
    focusAfterRetry.current = true
    void finish(true)
  }

  return { finished, error, pending, finish, retry, consoleRef }
}

export const AuthCheckRecovery = ({
  error,
  pending,
  onRetry,
  onSignIn,
}: {
  error: AuthCheckFailure
  pending: boolean
  onRetry: () => void
  onSignIn: () => void
}) => (
  <ConnectionErrorView
    title={
      error.renewalUnavailable ? "Could not renew your SSO session" : undefined
    }
    error={error.message}
    status={
      pending
        ? "Reconnecting…"
        : error.renewalUnavailable
          ? "Renewal failed. Retry connection, or sign in again."
          : "Connection failed. Retry connection."
    }
    pending={pending}
    onRetry={onRetry}
    onSignIn={error.renewalUnavailable ? onSignIn : undefined}
  />
)
