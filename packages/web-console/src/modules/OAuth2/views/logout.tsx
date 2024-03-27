import React from "react"
import { Layout } from "./layout"
import { Text } from "../../../components"
import { Box, Button } from "@questdb/react-components"
import { LoginCircle } from "@styled-icons/remix-line"

export const Logout = ({ onLogout }: { onLogout: () => void }) => (
  <Layout>
    <Box gap="1rem">
      <Text color="foreground">You have been logged out.</Text>
      <Button
        prefixIcon={<LoginCircle size={18} />}
        skin="secondary"
        onClick={onLogout}
      >
        Log in
      </Button>
    </Box>
  </Layout>
)
