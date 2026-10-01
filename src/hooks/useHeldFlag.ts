import { useEffect, useState } from "react"

// On while `active`, and for at least `minMs` from when it turned on, so a
// short activity still shows for `minMs`.
export const useHeldFlag = (active: boolean, minMs: number): boolean => {
  const [heldUntil, setHeldUntil] = useState<number | null>(null)

  useEffect(() => {
    if (active) setHeldUntil(Date.now() + minMs)
  }, [active, minMs])

  useEffect(() => {
    if (active || heldUntil === null) return
    const releaseTimerId = window.setTimeout(
      () => setHeldUntil(null),
      heldUntil - Date.now(),
    )
    return () => window.clearTimeout(releaseTimerId)
  }, [active, heldUntil])

  return active || (heldUntil !== null && Date.now() < heldUntil)
}
