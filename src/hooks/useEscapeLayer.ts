import { useEffect, useRef } from "react"
import { registerEscapeLayer, type EscapeLayer } from "../utils/escapeKey"

// Registers an ambient Escape layer while `enabled`. See utils/escapeKey.ts
// for the model. The latest callbacks are always used, so callers need not
// memoize them.
export const useEscapeLayer = (enabled: boolean, layer: EscapeLayer) => {
  const latest = useRef(layer)
  latest.current = layer

  useEffect(() => {
    if (!enabled) return
    return registerEscapeLayer({
      priority: latest.current.priority,
      scope: () => latest.current.scope?.() ?? null,
      onEscape: (event) => latest.current.onEscape(event),
    })
  }, [enabled])
}
