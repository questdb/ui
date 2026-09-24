import { useEffect, useState } from "react"

// Turns on only once the work outlasts `delayMs`, then stays on for at least
// `minVisibleMs`. Without the floor, work that just crosses the delay would
// flash the indicator for a few milliseconds.
export const useDelayedFlag = (
  active: boolean,
  delayMs: number,
  minVisibleMs: number,
): boolean => {
  const [shownAtMs, setShownAtMs] = useState<number | null>(null)

  useEffect(() => {
    if (active) {
      if (shownAtMs !== null) return
      const showTimerId = window.setTimeout(
        () => setShownAtMs(Date.now()),
        delayMs,
      )
      return () => window.clearTimeout(showTimerId)
    }

    if (shownAtMs === null) return
    const remainingMs = shownAtMs + minVisibleMs - Date.now()
    if (remainingMs <= 0) {
      setShownAtMs(null)
      return
    }
    const hideTimerId = window.setTimeout(() => setShownAtMs(null), remainingMs)
    return () => window.clearTimeout(hideTimerId)
  }, [active, delayMs, minVisibleMs, shownAtMs])

  return shownAtMs !== null
}
