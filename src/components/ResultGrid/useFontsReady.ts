import { useEffect, useState } from "react"
import { invalidateMeasuredFont } from "./inlineGridUtils"

const fontsLoaded = (): boolean =>
  typeof document === "undefined" ||
  !("fonts" in document) ||
  document.fonts.status === "loaded"

export const useFontsReady = (): boolean => {
  const [ready, setReady] = useState(fontsLoaded)

  useEffect(() => {
    if (ready) return
    let cancelled = false
    void document.fonts.ready.then(() => {
      invalidateMeasuredFont()
      if (cancelled) return
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [ready])

  return ready
}
