import React, { useCallback, useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { Button, CenteredLayout, Text } from "../../components"
import { Box } from "../../components/Box"
import { CloseOutline, Refresh } from "../../components/icons"
import { authSessionState } from "../../modules/OAuth2/ssoAuthState"
import { endedFor, isCancelledByUser } from "../../modules/OAuth2/session"
import { questClient } from "../../utils/questdb/queryClient"
import type { ErrorResult } from "../../utils/questdb/types"

const Heading = styled.h1`
  margin: 0;
  font-size: 2rem;
  color: var(--qdb-color-contentPrimary);
  outline: none;
`

const ErrorMessage = styled.div`
  display: flex;
  align-items: center;
  gap: 0.2rem;
`

const ErrorIcon = styled(CloseOutline)`
  color: var(--qdb-color-statusDanger);
  flex-shrink: 0;
`

export const useAuthCheck = (required: boolean) => {
  const [finished, setFinished] = useState(!required)
  const [error, setError] = useState<string>()
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
    if (finished && focusAfterRetry.current) {
      focusAfterRetry.current = false
      consoleRef.current?.focus()
    }
  }, [finished])

  const finish = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    const session = authSessionState.capture()
    setPending(true)
    try {
      await questClient.queryRaw("SELECT 1")
      if (mounted.current && !endedFor(session)) setFinished(true)
    } catch (failure) {
      if (
        mounted.current &&
        !endedFor(session, failure) &&
        !isCancelledByUser(failure)
      ) {
        setError(
          (failure as Partial<ErrorResult>)?.error ||
            "Could not connect to QuestDB.",
        )
      }
    } finally {
      inFlight.current = false
      if (mounted.current && !endedFor(session)) setPending(false)
    }
  }, [])

  const retry = () => {
    if (pending) return
    focusAfterRetry.current = true
    void finish()
  }

  return { finished, error, pending, finish, retry, consoleRef }
}

export const AuthCheckRecovery = ({
  error,
  pending,
  onRetry,
}: {
  error: string
  pending: boolean
  onRetry: () => void
}) => {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <CenteredLayout>
      <Box flexDirection="column" gap="2rem" align="center">
        <Heading ref={heading} tabIndex={-1}>
          Could not connect to QuestDB
        </Heading>
        <div role="alert">
          <ErrorMessage>
            <ErrorIcon size="18px" aria-hidden="true" />
            <Text color="statusDanger" size="md">
              {error}
            </Text>
          </ErrorMessage>
        </div>
        <div role="status">
          <Text color="contentSecondary">
            {pending ? "Reconnecting…" : "Connection failed. Retry connection."}
          </Text>
        </div>
        {/* aria-disabled keeps focus on the retry control during the request. */}
        <Button
          aria-disabled={pending}
          aria-busy={pending}
          onClick={onRetry}
          prefixIcon={<Refresh size="18px" />}
        >
          Retry connection
        </Button>
      </Box>
    </CenteredLayout>
  )
}
