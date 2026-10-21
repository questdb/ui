import React from "react"
import { Box } from "../../../components/Box"
import { Text } from "../../../components/Text"
import { useEndedSessionWriteCount } from "../../../hooks/useEndedSessionWriteCount"

export const UNFINISHED_WRITES_TOAST_ID = "ended-session-writes"

// Shown in the console after signing in again without leaving the page, while
// uploads or settings saves of the previous session are still being sent.
export const UnfinishedWritesWarning = () => {
  const count = useEndedSessionWriteCount()

  // AuthProvider dismisses the warning once they settle, while this shows.
  if (count === 0) {
    return (
      <Text weight={600} color="contentPrimary">
        Your previous session finished sending its requests.
      </Text>
    )
  }

  return (
    <Box flexDirection="column" gap="0.4rem" align="flex-start">
      <Text weight={600} color="contentPrimary">
        {count === 1
          ? "Your previous session is still sending 1 request"
          : `Your previous session is still sending ${count} requests`}
      </Text>
      <Text size="sm" color="contentSecondary">
        {count === 1
          ? "Keep this tab open until it finishes. Leaving the page, reloading it or logging out cancels it, which can leave a partially imported table. Importing the same file again meanwhile can import its rows twice."
          : "Keep this tab open until they finish. Leaving the page, reloading it or logging out cancels them, which can leave a partially imported table. Importing the same files again meanwhile can import their rows twice."}
      </Text>
    </Box>
  )
}
