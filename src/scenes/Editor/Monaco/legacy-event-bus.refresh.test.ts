import { afterEach, describe, expect, it, vi } from "vitest"
import type { editor } from "monaco-editor"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"
import { RunningType } from "../../../store/Query/types"
import { registerLegacyEventBusEvents } from "./legacy-event-bus"

let cleanup: (() => void) | undefined
afterEach(() => cleanup?.())

describe("legacy editor events", () => {
  // The grid's Re-run publishes the SQL it displays. The editor's own last
  // query differs after an AI chat run or once the editor remounts.
  it("re-runs the query the result grid asked for", () => {
    const onRefresh = vi.fn()
    cleanup = registerLegacyEventBusEvents({
      editor: {} as editor.IStandaloneCodeEditor,
      onRefresh,
      toggleRunning: vi.fn(),
      getRunning: () => RunningType.NONE,
      // Only the options this event reads.
    } as unknown as Parameters<typeof registerLegacyEventBusEvents>[0])
    eventBus.publish(EventType.MSG_QUERY_EXEC, { q: "select 2" })
    expect(onRefresh).toHaveBeenCalledWith("select 2")
  })
})
