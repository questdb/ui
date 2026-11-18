import { useEscapeLayer } from "../../hooks/useEscapeLayer"
import { EscapePriority } from "../../utils/escapeKey"

// Escape rejects a pending AI suggestion (utils/escapeKey.ts). Global: the
// Reject button advertises Esc, so it answers the pending diff wherever the
// focus is, including a draft in the AI chat input.
export const usePendingDiffEscape = (pending: boolean, reject: () => void) =>
  useEscapeLayer(pending, {
    priority: EscapePriority.editorDiff,
    global: true,
    onEscape: () => {
      reject()
      return true
    },
  })
