import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react"

const RESIZE_DEBOUNCE_MS = 100

export const useContainerWidth = (ref: RefObject<HTMLElement>): number => {
  const [width, setWidth] = useState(800)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useLayoutEffect(() => {
    const measured = ref.current?.getBoundingClientRect().width
    // A 0 width (not laid out yet) would collapse every column to zero.
    if (measured) setWidth(measured)
  }, [ref])

  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => {
      const measured = entry.contentRect.width
      if (!measured) return
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(
        () => setWidth(measured),
        RESIZE_DEBOUNCE_MS,
      )
    })
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [ref])

  return width
}
