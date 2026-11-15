import { describe, it, expect } from "vitest"
import {
  applyUserActionToDigest,
  createEmptyDigest,
  isEmptyDigest,
  routesUserAction,
} from "./userActionDigest"
import type { UserActionEvent } from "../../utils/notebooks/notebookAIBridge"

const apply = (events: UserActionEvent[]) => {
  const d = createEmptyDigest()
  for (const e of events) applyUserActionToDigest(d, e)
  return d
}

describe("createEmptyDigest / isEmptyDigest", () => {
  it("starts empty", () => {
    expect(isEmptyDigest(createEmptyDigest())).toBe(true)
  })

  it("is not empty after a single added cell", () => {
    const d = apply([{ kind: "user_added_cell", bufferId: 1, cellId: "a" }])
    expect(isEmptyDigest(d)).toBe(false)
  })

  it("stays empty for events that only affect the snapshot", () => {
    const d = apply([
      { kind: "user_moved_cell", bufferId: 1, cellId: "a" },
      {
        kind: "user_duplicated_cell",
        bufferId: 1,
        cellId: "a",
        newCellId: "b",
      },
      {
        kind: "user_changed_cell_mode",
        bufferId: 1,
        cellId: "a",
        mode: "draw",
      },
      { kind: "user_changed_grid_layout", bufferId: 1 },
    ])
    expect(isEmptyDigest(d)).toBe(true)
  })

  it("is not empty after an Off autorefresh default change", () => {
    // Given only a default change to Off — false must count as a value
    const d = apply([
      { kind: "user_changed_autorefresh_default", bufferId: 1, value: false },
    ])
    // Then the digest reaches the agent instead of being dropped as empty
    expect(isEmptyDigest(d)).toBe(false)
  })
})

describe("user_added_cell", () => {
  it("adds the cell id to `added`", () => {
    const d = apply([{ kind: "user_added_cell", bufferId: 1, cellId: "a" }])
    expect([...d.added]).toEqual(["a"])
  })

  it("dedupes repeated adds of the same id", () => {
    const d = apply([
      { kind: "user_added_cell", bufferId: 1, cellId: "a" },
      { kind: "user_added_cell", bufferId: 1, cellId: "a" },
    ])
    expect(d.added.size).toBe(1)
  })
})

describe("user_deleted_cell", () => {
  it("add-then-delete cancels both", () => {
    const d = apply([
      { kind: "user_added_cell", bufferId: 1, cellId: "a" },
      { kind: "user_deleted_cell", bufferId: 1, cellId: "a" },
    ])
    expect(d.added.size).toBe(0)
    expect(d.deleted.size).toBe(0)
  })

  it("delete-on-existing moves to `deleted`", () => {
    const d = apply([{ kind: "user_deleted_cell", bufferId: 1, cellId: "a" }])
    expect([...d.deleted]).toEqual(["a"])
  })

  it("delete removes the cell from edited and ran", () => {
    const d = apply([
      { kind: "user_updated_cell", bufferId: 1, cellId: "a" },
      {
        kind: "user_ran_cell",
        bufferId: 1,
        cellId: "a",
        status: "success",
      },
      { kind: "user_deleted_cell", bufferId: 1, cellId: "a" },
    ])
    expect(d.edited.has("a")).toBe(false)
    expect(d.ran.has("a")).toBe(false)
    expect(d.deleted.has("a")).toBe(true)
  })
})

describe("user_updated_cell", () => {
  it("adds to `edited` for an existing cell", () => {
    const d = apply([{ kind: "user_updated_cell", bufferId: 1, cellId: "a" }])
    expect([...d.edited]).toEqual(["a"])
  })

  it("is a no-op when the cell is in `added` (edits fold into the add)", () => {
    const d = apply([
      { kind: "user_added_cell", bufferId: 1, cellId: "a" },
      { kind: "user_updated_cell", bufferId: 1, cellId: "a" },
      { kind: "user_updated_cell", bufferId: 1, cellId: "a" },
    ])
    expect(d.added.has("a")).toBe(true)
    expect(d.edited.has("a")).toBe(false)
  })

  it("dedupes repeated edits on the same id", () => {
    const d = apply([
      { kind: "user_updated_cell", bufferId: 1, cellId: "a" },
      { kind: "user_updated_cell", bufferId: 1, cellId: "a" },
      { kind: "user_updated_cell", bufferId: 1, cellId: "a" },
    ])
    expect(d.edited.size).toBe(1)
  })
})

describe("user_ran_cell", () => {
  it("latest status wins", () => {
    const d = apply([
      { kind: "user_ran_cell", bufferId: 1, cellId: "a", status: "error" },
      {
        kind: "user_ran_cell",
        bufferId: 1,
        cellId: "a",
        status: "success",
      },
    ])
    expect(d.ran.get("a")).toBe("success")
  })
})

describe("user_changed_layout_mode", () => {
  it("stores the final mode", () => {
    const d = apply([
      { kind: "user_changed_layout_mode", bufferId: 1, mode: "list" },
      { kind: "user_changed_layout_mode", bufferId: 1, mode: "grid" },
    ])
    expect(d.layoutModeTo).toBe("grid")
  })
})

describe("user_changed_autorefresh_default", () => {
  it("stores the final value, including Off (false)", () => {
    const d = apply([
      { kind: "user_changed_autorefresh_default", bufferId: 1, value: "30s" },
      { kind: "user_changed_autorefresh_default", bufferId: 1, value: false },
    ])
    // false means "Off" — a valid final value the digest must keep
    expect(d.autoRefreshDefaultTo).toBe(false)
  })
})

describe("tab lifecycle events", () => {
  it("user_archived_tab records a closed tab of any kind", () => {
    const d = apply([
      { kind: "user_archived_tab", bufferId: 1, tabKind: "sql", label: "Q1" },
    ])
    expect(d.tabChanges).toEqual([
      { bufferId: 1, kind: "sql", label: "Q1", status: "closed" },
    ])
  })

  it("user_deleted_tab records a deleted tab", () => {
    const d = apply([
      {
        kind: "user_deleted_tab",
        bufferId: 2,
        tabKind: "metrics",
        label: "CPU",
      },
    ])
    expect(d.tabChanges).toEqual([
      { bufferId: 2, kind: "metrics", label: "CPU", status: "deleted" },
    ])
  })

  it("delete wins over close for the same tab", () => {
    const d = apply([
      {
        kind: "user_archived_tab",
        bufferId: 1,
        tabKind: "notebook",
        label: "N",
      },
      {
        kind: "user_deleted_tab",
        bufferId: 1,
        tabKind: "notebook",
        label: "N",
      },
    ])
    expect(d.tabChanges).toEqual([
      { bufferId: 1, kind: "notebook", label: "N", status: "deleted" },
    ])
  })
})

describe("routesUserAction", () => {
  const boundChat = { notebookBufferId: 7 }
  const otherChat = { notebookBufferId: 8 }
  const unboundChat = {}
  const tabEvent = (
    kind: "user_archived_tab" | "user_deleted_tab",
    bufferId: number,
  ): UserActionEvent => ({ kind, bufferId, tabKind: "sql", label: "SQL" })

  it.each(["user_archived_tab", "user_deleted_tab"] as const)(
    "sends %s for any tab to every chat",
    (kind) => {
      // Given a chat bound to notebook 7, one bound to 8 and an unbound chat
      // When the user closes or deletes a SQL tab no chat is bound to
      const event = tabEvent(kind, 3)
      // Then every chat hears about it
      expect(routesUserAction(boundChat, event)).toBe(true)
      expect(routesUserAction(otherChat, event)).toBe(true)
      expect(routesUserAction(unboundChat, event)).toBe(true)
    },
  )

  it("sends cell events only to the chat bound to that notebook", () => {
    // Given a cell edit in notebook 7
    const event: UserActionEvent = {
      kind: "user_added_cell",
      bufferId: 7,
      cellId: "a",
    }
    // Then only the chat bound to notebook 7 hears about it
    expect(routesUserAction(boundChat, event)).toBe(true)
    expect(routesUserAction(otherChat, event)).toBe(false)
    expect(routesUserAction(unboundChat, event)).toBe(false)
  })
})
