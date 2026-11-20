import { useEscapeLayer } from "../../hooks/useEscapeLayer"
import { EscapePriority } from "../../utils/escapeKey"

// Escape rejects a pending AI suggestion (utils/escapeKey.ts), before a side
// panel closes. A press inside a side panel closes that panel instead.
export const usePendingDiffEscape = (pending: boolean, reject: () => void) =>
  useEscapeLayer(pending, {
    priority: EscapePriority.editorDiff,
    onEscape: () => {
      reject()
      return true
    },
  })
