import { useEffect, useState } from "react"

// On while `active`, and for `holdMs` after it turns off. Activity inside
// the hold restarts it, so a flag that flips often stays on.
export const useHeldFlag = (active: boolean, holdMs: number): boolean => {
  const [held, setHeld] = useState(active)

  useEffect(() => {
    if (active) {
      setHeld(true)
      return
    }
    if (!held) return
    const releaseTimerId = window.setTimeout(() => setHeld(false), holdMs)
    return () => window.clearTimeout(releaseTimerId)
  }, [active, holdMs, held])

  return active || held
}
