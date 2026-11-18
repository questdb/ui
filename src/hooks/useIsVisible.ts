import { useEffect, useState, RefObject } from "react"

export const useIsVisible = <T extends Element = HTMLDivElement>(
  ref: RefObject<T | null>,
) => {
  const [isIntersecting, setIntersecting] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) =>
      setIntersecting(entry.isIntersecting),
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => {
      observer.disconnect()
    }
  }, [ref])

  return isIntersecting
}
