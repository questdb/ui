import React from "react"
import { Layout } from "./layout"
import { Text } from "../../../components"
import { Box, Button } from "@questdb/react-components"
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
    <Layout>
      <Box flexDirection="column" gap="2rem">
        <Text color="foreground">{errorMessage}</Text>
        {!basicAuthEnabled && (
          <Button
            skin="secondary"
            prefixIcon={<User size="18px" />}
            onClick={() => onLogout()}
          >
            Login with other account
          </Button>
        )}
      </Box>
    </Layout>
  )
}
