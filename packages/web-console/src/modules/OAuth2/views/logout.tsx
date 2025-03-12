import React from "react"
import { Text, CenteredLayout } from "../../../components"
import { Box, Button } from "@questdb/react-components"
import { LoginCircle } from "@styled-icons/remix-line"

export const Logout = ({ onLogout }: { onLogout: () => void }) => (
  <CenteredLayout>
    <Box gap="1rem">
      <Text color="foreground">You have been logged out.</Text>
      <Button
        data-hook="button-log-in"
        prefixIcon={<LoginCircle size={18} />}
        skin="secondary"
        onClick={onLogout}
      >
        Log in
      </Button>
    </Box>
  </CenteredLayout>
)
