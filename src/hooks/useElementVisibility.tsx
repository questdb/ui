import { useState, useEffect, useRef, useCallback } from "react"

const useElementVisibility = (refreshInterval: number = 1000) => {
  const [isVisible, setIsVisible] = useState(true)
  const elementRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef(Date.now())

  const checkRenderingStatus = useCallback(() => {
    const now = Date.now()
    const timeSinceLastFrame = now - lastFrameTimeRef.current
    lastFrameTimeRef.current = now

    const isThrottled = timeSinceLastFrame > refreshInterval * 2

    if (isThrottled !== !isVisible) {
      setIsVisible(!isThrottled)
    }

    rafIdRef.current = requestAnimationFrame(checkRenderingStatus)
  }, [refreshInterval, isVisible])

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsVisible(entry.isIntersecting)
        })
      },
      {
        threshold: 0.1,
      },
    )

    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden)
    }

    if (elementRef.current) {
      observerRef.current.observe(elementRef.current)
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    rafIdRef.current = requestAnimationFrame(checkRenderingStatus)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [checkRenderingStatus])

  return [elementRef, isVisible] as const
}

export default useElementVisibility
