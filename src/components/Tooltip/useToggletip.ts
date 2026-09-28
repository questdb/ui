import { useEffect, useRef, useState } from "react"
import type { TooltipContentProps } from "@radix-ui/react-tooltip"

// Radix drives hover / focus natively. A click pins the tooltip open until the
// trigger is clicked again, Escape is pressed, focus leaves, the pointer goes
// down anywhere else, or an ancestor of the trigger scrolls.
export const useToggletip = () => {
  const [autoOpen, setAutoOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const unpin = () => setPinned(false)

  const onPointerDownOutside: TooltipContentProps["onPointerDownOutside"] = (
    event,
  ) => {
    if (triggerRef.current?.contains(event.target as Node)) {
      event.preventDefault()
      return
    }
    unpin()
  }

  // Radix closes the tooltip on pointer down. Skipping it keeps the tooltip
  // visible until the click toggles the pin, so it does not flash.
  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) =>
    event.preventDefault()

  useEffect(() => {
    if (!pinned) return
    const unpinOnTriggerScroll = (event: Event) => {
      if (
        event.target instanceof Node &&
        event.target.contains(triggerRef.current)
      ) {
        unpin()
      }
    }
    window.addEventListener("scroll", unpinOnTriggerScroll, { capture: true })
    return () =>
      window.removeEventListener("scroll", unpinOnTriggerScroll, {
        capture: true,
      })
  }, [pinned])

  return {
    tooltipProps: {
      open: pinned || autoOpen,
      onOpenChange: setAutoOpen,
      onEscapeKeyDown: unpin,
      onPointerDownOutside,
    },
    triggerProps: {
      ref: triggerRef,
      onPointerDown,
      onClick: () => setPinned((current) => !current),
      onBlur: unpin,
    },
  }
}
