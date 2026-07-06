import { useEffect, useLayoutEffect, useState, type RefObject } from "react"

const RESIZE_DEBOUNCE_MS = 100

export const useContainerWidth = (
  ref: RefObject<HTMLElement>,
): number | null => {
  const [width, setWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const measured = ref.current?.getBoundingClientRect().width
    // A 0 width (not laid out yet) would collapse every column to zero.
    if (measured) setWidth(measured)
  }, [ref])

  useEffect(() => {
    if (!ref.current) return
    let timer: number | null = null
    const observer = new ResizeObserver(([entry]) => {
      const measured = entry.contentRect.width
      if (!measured) return
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => setWidth(measured), RESIZE_DEBOUNCE_MS)
    })
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [ref])

  return width
}
