import { describe, it, expect } from "vitest"
import {
  applyUserActionToDigest,
  createEmptyDigest,
  isEmptyDigest,
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

describe("notebook lifecycle events", () => {
  it("user_archived_notebook flips the flag to archived", () => {
    const d = apply([{ kind: "user_archived_notebook", bufferId: 1 }])
    expect(d.notebookStatusChange).toBe("archived")
  })

  it("user_deleted_notebook flips the flag to deleted", () => {
    const d = apply([{ kind: "user_deleted_notebook", bufferId: 1 }])
    expect(d.notebookStatusChange).toBe("deleted")
  })

  it("delete wins over archive if both fire", () => {
    const d = apply([
      { kind: "user_archived_notebook", bufferId: 1 },
      { kind: "user_deleted_notebook", bufferId: 1 },
    ])
    expect(d.notebookStatusChange).toBe("deleted")
  })
})
