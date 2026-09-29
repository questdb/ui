import { useEffect, useState } from "react"
import { isRe2Ready, loadRe2 } from "./pattern"

// True once RE2 is loaded; `needed` starts the load, so a grid without a
// pattern rule never pays for it.
export const useRe2Ready = (needed: boolean): boolean => {
  const [ready, setReady] = useState(isRe2Ready)

  useEffect(() => {
    if (!needed || ready) return
    let active = true
    void loadRe2().then(() => {
      if (active) setReady(true)
    })
    return () => {
      active = false
    }
  }, [needed, ready])

  return ready
}
