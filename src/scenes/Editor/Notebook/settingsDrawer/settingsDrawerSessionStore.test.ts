import { describe, expect, it } from "vitest"
import { createSettingsDrawerSessionStore } from "./settingsDrawerSessionStore"

describe("settings drawer session store", () => {
  it("keeps a session with its draft until it is cleared", () => {
    // Given an open session with an in-progress draft
    const store = createSettingsDrawerSessionStore<{ draft: string | null }>()
    store.set("c1:0", { draft: null })
    store.update("c1:0", { draft: "edited" })

    // When the same key is read back, as a remounted panel would
    const restored = store.get("c1:0")

    // Then the draft is there, and clearing the cell removes it
    expect(restored).toEqual({ draft: "edited" })
    store.clearWhere((key) => key.startsWith("c1:"))
    expect(store.get("c1:0")).toBeUndefined()
  })

  it("ignores an update for a session that is not open", () => {
    // Given no session
    const store = createSettingsDrawerSessionStore<{ draft: string | null }>()

    // When a draft change arrives for it
    store.update("c1:0", { draft: "late" })

    // Then nothing is created
    expect(store.get("c1:0")).toBeUndefined()
  })
})
