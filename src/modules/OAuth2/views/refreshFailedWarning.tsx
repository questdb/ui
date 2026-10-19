import React, { useEffect, useState } from "react"
import { Button } from "../../../components/Button"
import {
  NOTIFICATION_SHORTCUT_LABEL,
  NOTIFICATION_SHORTCUT_SCOPE,
} from "../../../components/Toast"
import { Box } from "../../../components/Box"
import { Text } from "../../../components/Text"

const MAX_TIMER_DELAY_MS = 2_147_483_647

export const RefreshFailedWarning = ({
  expiresAt,
  onSignIn,
}: {
  expiresAt?: string
  onSignIn: () => void
}) => {
  const expiry = expiresAt ? Date.parse(expiresAt) : NaN
  const [expired, setExpired] = useState(() => !(expiry > Date.now()))

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const updateExpiry = () => {
      const remaining = expiry - Date.now()
      setExpired(!(remaining > 0))
      if (remaining > 0) {
        timer = setTimeout(
          updateExpiry,
          Math.min(remaining, MAX_TIMER_DELAY_MS),
        )
      }
    }
    updateExpiry()
    return () => clearTimeout(timer)
  }, [expiry])

  return (
    <Box flexDirection="column" gap="1rem" align="flex-start">
      <Text color="contentPrimary">
        {expired
          ? "Could not renew your SSO session. Queries are not being sent. Retry them to renew, or sign in again."
          : `Could not renew your SSO session. Your current token expires at ${new Date(expiry).toLocaleTimeString()}.`}
      </Text>
      <Text size="sm" color="contentSecondary">
        Signing in again ends this session and interrupts running requests.
        Statements may have executed; verify their outcomes before retrying.
      </Text>
      <Button size="sm" onClick={onSignIn}>
        Sign in again
      </Button>
      <Text size="sm" color="contentSecondary">
        Close any open dialog, then press {NOTIFICATION_SHORTCUT_LABEL}
        {NOTIFICATION_SHORTCUT_SCOPE} to focus this notification. Press Escape
        to return without dismissing it.
      </Text>
    </Box>
  )
}
