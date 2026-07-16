import { describe, it, expect, beforeEach } from "vitest"
import { buildNotebookFreshness } from "./executeAIFlow"
import type { NotebookContextSnapshot } from "./notebookSnapshot"
import {
  __resetNotebookAIBridgeForTests,
  getBufferActionSeq,
  signalUserEdit,
} from "../notebooks/notebookAIBridge"

describe("buildNotebookFreshness — per-turn flow freshness tracker", () => {
  beforeEach(() => {
    __resetNotebookAIBridgeForTests()
  })

  it("returns a recordable tracker even with no notebook context (no deadlock)", () => {
    // Given a flow with no notebook context (a Fix/Explain quick action, or a
    // chat before any notebook is open)
    const freshness = buildNotebookFreshness(undefined)

    // Then the gate gets a real tracker, not undefined: an un-read buffer is
    // NOT_FETCHED up front...
    expect(freshness.assertFresh(7)).toBe("not_fetched")

    // ...but recording a read (what get_notebook_state does) makes it fresh, so
    // the mutation the model retries can actually go through.
    freshness.recordRead(7, getBufferActionSeq(7))
    expect(freshness.assertFresh(7)).toBe("fresh")

    // And a later user edit correctly re-stales it.
    signalUserEdit(7)
    expect(freshness.assertFresh(7)).toBe("stale")
  })

  it("seeds the bound notebook as fresh when the chat has an up-to-date snapshot", () => {
    // Given a chat bound to notebook 3, snapshotted at the current action seq
    const snapshot: NotebookContextSnapshot = {
      status: "ok",
      buffer_id: 3,
      label: "Trades",
      layout_mode: "list",
      maximized_cell_id: null,
      cells: [],
    }
    const freshness = buildNotebookFreshness({
      snapshot,
      readSeq: getBufferActionSeq(3),
    })

    // Then buffer 3 is immediately fresh (no get_notebook_state round-trip),
    // while an unrelated buffer is still not_fetched.
    expect(freshness.assertFresh(3)).toBe("fresh")
    expect(freshness.assertFresh(4)).toBe("not_fetched")
  })
})
