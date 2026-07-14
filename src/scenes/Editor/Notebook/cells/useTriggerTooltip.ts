import { useRef, useState } from "react"

// A tooltip on a button that also opens a Radix menu/dropdown. Radix drives the
// tooltip natively (hover / keyboard focus / Tab) — we only intervene twice:
//   1. keep it closed while the menu is open, and
//   2. swallow the single open Radix fires when the menu CLOSES and restores
//      focus to the trigger — otherwise the tooltip pops even though the pointer
//      has already moved away (e.g. you clicked outside to dismiss the menu).
export const useTriggerTooltip = () => {
  const [open, setOpen] = useState(false)
  const menuOpenRef = useRef(false)
  const swallowNextOpenRef = useRef(false)

  const onMenuOpenChange = (menuOpen: boolean) => {
    menuOpenRef.current = menuOpen
    if (menuOpen) {
      setOpen(false)
    } else {
      swallowNextOpenRef.current = true
    }
  }

  const onOpenChange = (next: boolean) => {
    if (next && menuOpenRef.current) return
    if (next && swallowNextOpenRef.current) {
      swallowNextOpenRef.current = false
      return
    }
    setOpen(next)
  }

  return {
    tooltipProps: { open, onOpenChange },
    onMenuOpenChange,
  }
}
