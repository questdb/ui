import { useEffect, useRef } from "react"

// A card that waits on the user (an agent's question) takes Escape from the
// drawer it sits in: it marks itself with DRAWER_ESCAPE_CLAIM, and on Escape
// the drawer sends it DRAWER_ESCAPE_EVENT instead of closing.
export const DRAWER_ESCAPE_CLAIM = "data-drawer-escape-claim"
export const DRAWER_ESCAPE_EVENT = "drawer-escape"

// The attributes that claim Escape, for as long as `claims` holds.
export const escapeClaimOf = (claims: boolean) =>
  claims ? { [DRAWER_ESCAPE_CLAIM]: "" } : {}

export const useDrawerEscape = (
  ref: React.RefObject<HTMLElement | null>,
  onEscape: () => void,
) => {
  const handler = useRef(onEscape)
  handler.current = onEscape
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const listener = () => handler.current()
    node.addEventListener(DRAWER_ESCAPE_EVENT, listener)
    return () => node.removeEventListener(DRAWER_ESCAPE_EVENT, listener)
  }, [])
}
