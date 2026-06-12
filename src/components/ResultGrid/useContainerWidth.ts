import { useEffect, useLayoutEffect, useState, type RefObject } from "react"

export const useContainerWidth = (ref: RefObject<HTMLElement>): number => {
  const [width, setWidth] = useState(800)

  useLayoutEffect(() => {
    const measured = ref.current?.getBoundingClientRect().width
    // A 0 width (not laid out yet) would collapse every column to zero.
    if (measured) setWidth(measured)
  }, [ref])

  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => {
      const measured = entry.contentRect.width
      if (measured) setWidth(measured)
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref])

  return width
}
