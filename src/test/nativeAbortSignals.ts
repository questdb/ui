import { transferableAbortController } from "node:util"
import { vi } from "vitest"

export const installNativeAbortSignals = () => {
  // Node 24's Request rejects jsdom signals. Keep HTTP and cancellation in one realm.
  const controller = transferableAbortController()
  vi.stubGlobal("AbortController", controller.constructor)
  vi.stubGlobal("AbortSignal", controller.signal.constructor)
}
