import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react"

const RESIZE_DEBOUNCE_MS = 100

// Subscribe to an element's debounced width, delivered to `onWidth`. Callers turn
// it into whatever state they actually depend on (raw px, a layout tier, …) so
// only the values they care about trigger a re-render.
export const useWidthObserver = (
  ref: RefObject<HTMLElement>,
  onWidth: (width: number) => void,
): void => {
  const onWidthRef = useRef(onWidth)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useLayoutEffect(() => {
    const measured = ref.current?.getBoundingClientRect().width
    // A 0 width (not laid out yet) would collapse every column to zero.
    if (measured) onWidthRef.current(measured)
  }, [ref])

  useEffect(() => {
    if (!ref.current) return
    const timer: number | null = null
    const observer = new ResizeObserver(([entry]) => {
      const measured = entry.contentRect.width
      if (!measured) return
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(
        () => onWidthRef.current(measured),
        RESIZE_DEBOUNCE_MS,
      )
    })
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [ref])

  useEffect(() => {
    onWidthRef.current = onWidth
  }, [onWidth])
}

export const useContainerWidth = (ref: RefObject<HTMLElement>): number => {
  const [width, setWidth] = useState(800)
  useWidthObserver(ref, setWidth)
  return width
}
