import React from "react"
import { CenteredLayout, Text, Button, Box } from "../../../components"
import { User } from "@styled-icons/remix-line"

export const Error = ({
  basicAuthEnabled,
  errorMessage,
  onLogout,
}: {
  basicAuthEnabled: boolean
  errorMessage?: string
  onLogout: () => void
}) => {
  return (
    <CenteredLayout>
      <Box flexDirection="column" gap="2rem">
        <Text color="foreground">{errorMessage}</Text>
        {!basicAuthEnabled && (
          <Button
            data-hook="button-login-with-other-account"
            skin="secondary"
            prefixIcon={<User size="18px" />}
            onClick={() => onLogout()}
          >
            Login
          </Button>
        )}
      </Box>
    </CenteredLayout>
  )
}
