import { useEffect, useState } from "react"
import { questClient } from "../utils/questdb/queryClient"

// Uploads and settings saves of ended sessions that are still being sent. They
// keep running until they settle, but leaving the page cancels them.
export const useEndedSessionWriteCount = () => {
  const [count, setCount] = useState(() => questClient.endedSessionWriteCount())
  useEffect(() => {
    // A write may have settled between the first render and subscribing.
    setCount(questClient.endedSessionWriteCount())
    return questClient.onEndedSessionWritesChange(setCount)
  }, [])
  return count
}
