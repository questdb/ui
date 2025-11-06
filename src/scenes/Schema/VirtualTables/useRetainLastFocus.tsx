import { useEffect } from "react"
import { VirtuosoHandle } from "react-virtuoso"

export const useRetainLastFocus = ({
  virtuosoRef,
  focusedIndex,
  setFocusedIndex,
  wrapperRef,
}: {
  virtuosoRef: React.RefObject<VirtuosoHandle>
  focusedIndex: number | null
  setFocusedIndex: (index: number | null) => void
  wrapperRef: React.RefObject<HTMLDivElement>
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        focusedIndex !== null &&
        wrapperRef.current &&
        !wrapperRef.current.contains(document.activeElement)
      ) {
        if (
          e.key === "ArrowDown" ||
          e.key === "ArrowUp" ||
          e.key === "Home" ||
          e.key === "End" ||
          e.key === "PageUp" ||
          e.key === "PageDown"
        ) {
          e.preventDefault()
          e.stopPropagation()

          virtuosoRef.current?.scrollIntoView({ index: focusedIndex })
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [focusedIndex, virtuosoRef, wrapperRef])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node) &&
        focusedIndex !== null
      ) {
        setFocusedIndex(null)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [focusedIndex, setFocusedIndex])
}
