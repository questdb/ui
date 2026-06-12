import { useCallback, useRef, useState, type RefObject } from "react"

// Tracks whether `ref` is scrolled past its top/left edge, so the header and
// frozen-column shadows can show.
export const useScrollShadows = (ref: RefObject<HTMLElement>) => {
  const [scrolledDown, setScrolledDown] = useState(false)
  const [shadowLeft, setShadowLeft] = useState(false)
  const scrolledDownRef = useRef(false)
  const shadowLeftRef = useRef(false)

  const handleScroll = useCallback(() => {
    const el = ref.current
    if (!el) return
    const down = el.scrollTop > 0
    const left = el.scrollLeft > 0
    if (down !== scrolledDownRef.current) {
      scrolledDownRef.current = down
      setScrolledDown(down)
    }
    if (left !== shadowLeftRef.current) {
      shadowLeftRef.current = left
      setShadowLeft(left)
    }
  }, [ref])

  return { scrolledDown, shadowLeft, handleScroll }
}
