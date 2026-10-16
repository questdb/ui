import React, { useEffect, useState } from "react"
import { Button } from "../../../components/Button"
import { NOTIFICATION_SHORTCUT } from "../../../components/Toast"

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
        timer = setTimeout(updateExpiry, Math.min(remaining, 2_147_483_647))
      }
    }
    updateExpiry()
    return () => clearTimeout(timer)
  }, [expiry])

  return (
    <div>
      <p>
        {expired
          ? "Could not renew your SSO session. Queries are paused until renewal succeeds."
          : `Could not renew your SSO session. Your current token expires at ${new Date(expiry).toLocaleTimeString()}.`}
      </p>
      <Button size="sm" onClick={onSignIn}>
        Sign in again
      </Button>
      <small>
        Close any open dialog, then press {NOTIFICATION_SHORTCUT} to focus this
        notification.
      </small>
    </div>
  )
}
