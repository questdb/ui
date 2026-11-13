// @vitest-environment jsdom
import React from "react"
import { act, waitFor } from "@testing-library/react"
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { findHook, queryHook, renderComponent } from "../../test/component"
import { db } from "../../store/db"
import { bufferStore, makeBuffer, type Buffer } from "../../store/buffers"
import { SettingContext } from "../SettingsProvider/context"
import type { ConsoleConfig } from "../SettingsProvider/types"
import { StoreKey } from "../../utils/localStorage/types"
import {
  on,
  requireWorkspace,
  type UserActionEvent,
} from "../../utils/notebooks/notebookAIBridge"
import { NotebookWorkspaceBridge } from "../../scenes/Editor/Notebook/NotebookWorkspaceBridge"
import {
  EditorProvider,
  MAX_TABS,
  useEditor,
  type EditorContext,
} from "./index"

vi.mock("@monaco-editor/react", () => ({
  loader: { init: () => new Promise(() => undefined), config: () => undefined },
}))
vi.mock(
  "../../scenes/Editor/Monaco/questdb-sql/useSchemaCompletionProvider",
  () => ({ useSchemaCompletionProvider: () => undefined }),
)
vi.mock("../../modules/ConsoleEventTracker", () => ({
  trackEvent: () => Promise.resolve(),
}))

const toastError = vi.hoisted(() => vi.fn())
vi.mock("../../components/Toast", () => ({
  toast: { error: toastError, success: vi.fn(), info: vi.fn() },
}))

// The latest context value, read after every provider render.
let editor: EditorContext
const Probe = () => {
  editor = useEditor()
  return <div data-hook="editor-ready">{editor.activeBuffer.label}</div>
}

// A console tab export holding one notebook, at the console's database version.
const exampleFile = (label: string) => ({
  formatName: "dexie",
  data: {
    databaseVersion: db.verno,
    data: [
      {
        tableName: "buffers",
        rows: [
          {
            label,
            value: "",
            position: 0,
            notebookViewState: {
              cells: [{ id: "c1", position: 0, value: "select 1" }],
            },
          },
        ],
      },
    ],
  },
})

const renderProvider = (
  consoleConfig: ConsoleConfig = {},
  withWorkspace = false,
) =>
  renderComponent(
    <SettingContext.Provider
      value={{
        settings: {},
        preferences: {},
        consoleConfig,
        warnings: [],
        refreshSettingsAndPreferences: () =>
          Promise.resolve({ settings: {}, preferences: {} }),
      }}
    >
      <EditorProvider>
        {withWorkspace && <NotebookWorkspaceBridge />}
        <Probe />
      </EditorProvider>
    </SettingContext.Provider>,
  )

const seed = async (rows: Array<Partial<Buffer>>, activeIndex = 0) => {
  await db.buffers.clear()
  const ids: number[] = []
  for (const [position, row] of rows.entries()) {
    ids.push(
      await db.buffers.add(
        makeBuffer({ label: `Tab ${position}`, position, ...row }),
      ),
    )
  }
  await bufferStore.setActiveId(ids[activeIndex])
  return ids
}

const activeId = async () => (await bufferStore.getActiveId())?.value

const waitForReady = () => findHook("editor-ready")

const openPositions = async () =>
  (await db.buffers.toArray())
    .filter((buffer) => !buffer.archived)
    .sort((left, right) => left.position - right.position)
    .map((buffer) => [buffer.label, buffer.position])

// Example files are parsed with importTabs, loaded on demand; a cold import
// takes seconds, so load it once up front.
beforeAll(async () => {
  await import("../../scenes/Editor/Monaco/importTabs")
}, 30_000)

beforeEach(async () => {
  toastError.mockReset()
  vi.stubGlobal(
    "matchMedia",
    () =>
      ({
        matches: false,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  )
  await db.open()
  if (!(await bufferStore.getActiveId())) {
    await db.editor_settings.add({ key: "activeBufferId", value: 0 })
  }
})

describe("EditorProvider: next active tab", () => {
  it.each(["closeBuffer", "deleteBuffer"] as const)(
    "returns to the startup tab after switching and calling %s",
    async (remove) => {
      // Given tabs B, C, A with A restored as the active tab
      const [b, , a] = await seed(
        [
          { label: "B", value: "select 1" },
          { label: "C", value: "select 2" },
          { label: "A", value: "select 3" },
        ],
        2,
      )
      renderProvider()
      await waitForReady()
      expect(editor.activeBuffer.id).toBe(a)

      // When the user switches to B and then removes B
      await act(() =>
        editor.setActiveBuffer(
          editor.buffers.find((x) => x.id === b) as Buffer,
        ),
      )
      await act(() => editor[remove](b))

      // Then the startup tab A becomes active instead of the neighbour C
      expect(editor.activeBuffer.id).toBe(a)
      expect(await activeId()).toBe(a)
    },
  )

  it("keeps earlier visits in order when a tab is revisited or activated again", async () => {
    // Given D at startup, followed by visits to A, B and A again
    const [a, b, , d] = await seed(
      [
        { label: "A", value: "select 1" },
        { label: "B", value: "select 2" },
        { label: "C", value: "select 3" },
        { label: "D", value: "select 4" },
      ],
      3,
    )
    renderProvider()
    await waitForReady()
    for (const id of [a, b, a, a]) {
      await act(() =>
        editor.setActiveBuffer(
          editor.buffers.find((x) => x.id === id) as Buffer,
        ),
      )
    }

    // When the revisited A is closed, followed by B
    await act(() => editor.closeBuffer(a))
    expect(editor.activeBuffer.id).toBe(b)
    await act(() => editor.closeBuffer(b))

    // Then the earlier startup visit to D wins over the unvisited neighbour C
    expect(editor.activeBuffer.id).toBe(d)
  })

  it("records the visible startup tab when the stored active tab is closed", async () => {
    // Given a closed stored active tab and A selected as the startup fallback
    const [a, b] = await seed(
      [
        { label: "A", position: 2, value: "select 1" },
        { label: "B", position: 0, value: "select 2" },
        { label: "C", position: 1, value: "select 3" },
        { archived: true, position: -1, value: "select 4" },
      ],
      3,
    )
    renderProvider()
    await waitForReady()
    expect(editor.activeBuffer.id).toBe(a)

    // When the user switches to B and closes it
    await act(() =>
      editor.setActiveBuffer(editor.buffers.find((x) => x.id === b) as Buffer),
    )
    await act(() => editor.closeBuffer(b))

    // Then A was the actual outgoing tab and becomes active again
    expect(editor.activeBuffer.id).toBe(a)
  })

  it("records each outgoing tab when switch requests overlap", async () => {
    // Given A at startup and two requests to switch to B and then C
    const [b, c, a] = await seed(
      [
        { label: "B", value: "select 1" },
        { label: "C", value: "select 2" },
        { label: "A", value: "select 3" },
      ],
      2,
    )
    renderProvider()
    await waitForReady()
    const originalEditor = editor

    // When the requests overlap and the user then closes C
    await act(async () => {
      await Promise.all(
        [b, c].map((id) =>
          originalEditor.setActiveBuffer(
            originalEditor.buffers.find((x) => x.id === id) as Buffer,
          ),
        ),
      )
    })
    expect(editor.activeBuffer.id).toBe(c)
    await act(() => editor.closeBuffer(c))

    // Then B was the last tab left and becomes active before A
    expect(editor.activeBuffer.id).toBe(b)
    await act(() => editor.closeBuffer(b))
    expect(editor.activeBuffer.id).toBe(a)
  })

  it("does not record a closed tab again when activating its replacement", async () => {
    // Given A at startup, then a visit to B
    const [c, a, b] = await seed(
      [
        { label: "C", value: "select 1" },
        { label: "A", value: "select 2" },
        { label: "B", value: "select 3" },
      ],
      1,
    )
    renderProvider({}, true)
    await waitForReady()
    await act(() =>
      editor.setActiveBuffer(editor.buffers.find((x) => x.id === b) as Buffer),
    )

    // When B is closed and an agent reopens it in the background
    await act(() => editor.closeBuffer(b))
    expect(editor.activeBuffer.id).toBe(a)
    await waitFor(() =>
      expect(editor.buffers.find((x) => x.id === b)?.archived).toBe(true),
    )
    await act(() => requireWorkspace().restoreTab(b))
    await waitFor(() =>
      expect(editor.buffers.find((x) => x.id === b)?.archived).toBe(false),
    )
    await act(() => editor.closeBuffer(a))

    // Then the neighbour C wins because B has no remaining visit in history
    expect(editor.activeBuffer.id).toBe(c)
  })

  it("does not record a closed-tab preview as an open-tab visit", async () => {
    // Given A at startup, a closed tab and an unvisited C
    const [a, closed, c] = await seed([
      { label: "A", value: "select 1" },
      { archived: true, position: -1, value: "select 2" },
      { label: "C", value: "select 3" },
    ])
    renderProvider({}, true)
    await waitForReady()

    // When the user previews the closed tab, switches to C and reopens the preview in the background
    await act(() => editor.previewBuffer(closed))
    await act(() =>
      editor.setActiveBuffer(editor.buffers.find((x) => x.id === c) as Buffer),
    )
    await act(() => requireWorkspace().restoreTab(closed))
    await waitFor(() =>
      expect(editor.buffers.find((x) => x.id === closed)?.archived).toBe(false),
    )
    await act(() => editor.closeBuffer(c))

    // Then the earlier visit to A wins over the reopened preview
    expect(editor.activeBuffer.id).toBe(a)
  })

  it("activates the most recently used tab, not the left neighbour", async () => {
    // Given four open tabs, of which B and then D were used last
    const [, b, , d] = await seed(
      [{ value: "a" }, { value: "b" }, { value: "c" }, { value: "d" }],
      0,
    )
    renderProvider()
    await waitForReady()
    await act(() =>
      editor.setActiveBuffer(editor.buffers.find((x) => x.id === b) as Buffer),
    )
    await act(() =>
      editor.setActiveBuffer(editor.buffers.find((x) => x.id === d) as Buffer),
    )

    // When the active tab D is closed
    await act(() => editor.closeBuffer(d))

    // Then B, the last one used, becomes active (the left neighbour is C)
    await waitFor(async () => expect(await activeId()).toBe(b))
    expect(editor.activeBuffer.id).toBe(b)
  })

  it("seeds the next tab from storage, not from a stale render", async () => {
    // Given a caller holding the context from an earlier render (an editor
    // action registered at mount, say)
    const [a, b] = await seed([{ value: "old a" }, { value: "b" }], 1)
    renderProvider()
    await waitForReady()
    const staleEditor = editor

    // When A's content changes in storage, then the stale caller deletes B
    await db.buffers.update(a, { value: "new a" })
    await waitFor(() =>
      expect(editor.buffers.find((x) => x.id === a)?.value).toBe("new a"),
    )
    await act(() => staleEditor.deleteBuffer(b))

    // Then A opens with its saved content, not the stale snapshot
    await waitFor(() => expect(editor.activeBuffer.id).toBe(a))
    expect(editor.activeBuffer.value).toBe("new a")
  })
})

describe("EditorProvider: workspace activation", () => {
  it.each([
    { label: "SQL", value: "select 2" },
    { label: "Metrics", metricsViewState: { metrics: [] } },
    { label: "Notebook", notebookViewState: { cells: [] } },
  ])(
    "activates a restored $label tab without waiting for a render",
    async (tab) => {
      // Given a closed tab and the agent's workspace controller
      const [, closed] = await seed([
        { label: "Open", value: "select 1" },
        { ...tab, archived: true, archivedAt: 1, position: -1 },
      ])
      renderProvider({}, true)
      await waitForReady()

      // When the agent restores and activates it in the same tool batch
      await act(async () => {
        const workspace = requireWorkspace()
        await workspace.restoreTab(closed)
        await workspace.activateTab(closed)
      })

      // Then the restored tab becomes active with its saved content
      expect(await activeId()).toBe(closed)
      expect(editor.activeBuffer).toMatchObject({ ...tab, archived: false })
    },
  )
})

describe("EditorProvider: adding tabs", () => {
  it("assigns distinct positions and default names to concurrent creations", async () => {
    // Given one open tab and the same creation callback for both requests
    await seed([{ label: "Initial" }])
    renderProvider()
    await waitForReady()
    const addBuffer = editor.addBuffer

    // When two tabs are created before the live query refreshes
    await act(async () => {
      await Promise.all([
        addBuffer(undefined, { activate: false }),
        addBuffer(undefined, { activate: false }),
      ])
    })

    // Then both names and positions are distinct
    expect(await openPositions()).toEqual([
      ["Initial", 0],
      ["SQL 1", 1],
      ["SQL 2", 2],
    ])
  })

  it("inserts concurrent tabs after an anchor without overlapping positions", async () => {
    // Given two tabs and the same insertion anchor for both requests
    const [anchor] = await seed([{ label: "A" }, { label: "B" }])
    renderProvider()
    await waitForReady()
    const addBuffer = editor.addBuffer

    // When both requests insert after A
    await act(async () => {
      await Promise.all([
        addBuffer(
          { label: "First" },
          { afterBufferId: anchor, activate: false },
        ),
        addBuffer(
          { label: "Second" },
          { afterBufferId: anchor, activate: false },
        ),
      ])
    })

    // Then each insertion shifts the current stored tabs
    expect(await openPositions()).toEqual([
      ["A", 0],
      ["Second", 1],
      ["First", 2],
      ["B", 3],
    ])
  })

  it("enforces the tab limit across concurrent creations", async () => {
    // Given one remaining slot and two requests using the same callback
    await seed(Array.from({ length: MAX_TABS - 1 }, () => ({})))
    renderProvider()
    await waitForReady()
    const addBuffer = editor.addBuffer
    let created: Array<Buffer | undefined> = []

    // When both requests try to use the final slot
    await act(async () => {
      created = await Promise.all([
        addBuffer({ label: "First" }, { activate: false }),
        addBuffer({ label: "Second" }, { activate: false }),
      ])
    })

    // Then only one request creates a tab
    expect(created.filter(Boolean)).toHaveLength(1)
    expect(await db.buffers.count()).toBe(MAX_TABS)
    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining("Tab limit reached"),
    )
  })
})

describe("EditorProvider: closed-tab preview", () => {
  it("does not write content into the previewed tab until it is kept open", async () => {
    // Given a closed metrics tab next to an open SQL tab
    const metricsViewState = { metrics: [], refreshRate: "auto" }
    const [, closed] = await seed([
      { value: "select 1" },
      {
        label: "Closed metrics",
        metricsViewState: metricsViewState as Buffer["metricsViewState"],
        archived: true,
        archivedAt: 1,
        position: -1,
      },
    ])
    renderProvider()
    await waitForReady()

    // When it is previewed and the metrics view writes back a change
    await act(() => editor.previewBuffer(closed))
    await waitFor(() => expect(editor.activeBuffer.id).toBe(closed))
    await act(() =>
      editor.updateBuffer(closed, {
        metricsViewState: {
          ...metricsViewState,
          refreshRate: "1m",
        } as Buffer["metricsViewState"],
      }),
    )

    // Then the stored row is unchanged
    expect((await db.buffers.get(closed))?.metricsViewState).toEqual(
      metricsViewState,
    )

    // When the user keeps it open and changes it again
    await act(() => editor.keepBufferOpen(closed))
    await act(() =>
      editor.updateBuffer(closed, {
        metricsViewState: {
          ...metricsViewState,
          refreshRate: "1m",
        } as Buffer["metricsViewState"],
      }),
    )

    // Then the change is saved
    expect((await db.buffers.get(closed))?.metricsViewState?.refreshRate).toBe(
      "1m",
    )
  })
})

describe("EditorProvider: reopening the previewed tab", () => {
  it("makes it a regular, editable tab", async () => {
    // Given a closed SQL tab that is being previewed
    const [, closed] = await seed([
      { value: "select 1" },
      {
        label: "Closed",
        value: "select 2",
        archived: true,
        archivedAt: 1,
        position: -1,
      },
    ])
    renderProvider()
    await waitForReady()
    await act(() => editor.previewBuffer(closed))
    await waitFor(() => expect(editor.activeBuffer.id).toBe(closed))

    // When it is reopened from the Tabs panel or the tab history
    await act(() => editor.restoreBuffer(closed))

    // Then it is open, no longer a preview, and edits are saved
    await waitFor(() => expect(editor.activeBuffer.isTemporary).toBeFalsy())
    expect((await db.buffers.get(closed))?.archived).toBe(false)
    await act(() => editor.updateBuffer(closed, { value: "select 3" }))
    expect((await db.buffers.get(closed))?.value).toBe("select 3")
  })
})

describe("EditorProvider: removing a tab", () => {
  it.each([
    ["archiveTab", "archiveTab"],
    ["archiveTab", "deleteTab"],
    ["deleteTab", "archiveTab"],
    ["deleteTab", "deleteTab"],
  ] as const)(
    "serializes %s followed by %s and rejects removal of the last open tab",
    async (first, second) => {
      // Given two open SQL tabs and the agent's workspace controller
      const [a, b] = await seed([
        { label: "A", value: "select 1" },
        { label: "B", value: "select 2" },
      ])
      renderProvider({}, true)
      await waitForReady()
      const workspace = requireWorkspace()
      let outcomes: PromiseSettledResult<void>[] = []

      // When two removal requests arrive before either finishes
      await act(async () => {
        outcomes = await Promise.allSettled([
          workspace[first](a),
          workspace[second](b),
        ])
      })

      // Then the first completes and the second preserves the last open tab
      expect(outcomes[0]).toEqual({ status: "fulfilled", value: undefined })
      expect(outcomes[1]).toMatchObject({
        status: "rejected",
        reason: { code: "last_tab" },
      })
      expect(await openPositions()).toEqual([["B", 0]])
      expect((await db.buffers.get(b))?.value).toBe("select 2")
      expect(editor.activeBuffer.id).toBe(b)
      expect(queryHook("editor-ready")).not.toBeNull()
      if (first === "archiveTab") {
        expect((await db.buffers.get(a))?.archived).toBe(true)
      } else {
        expect(await db.buffers.get(a)).toBeUndefined()
      }

      // When another tab is created after the rejected request
      await act(async () => {
        await editor.addBuffer({ label: "C", value: "select 3" })
      })
      await act(() => editor.deleteBuffer(b, true, "agent"))

      // Then the rejection has not blocked later removals
      expect(await openPositions()).toEqual([["C", 0]])
    },
  )

  it("preserves the last open tab when user removals overlap", async () => {
    // Given two open tabs and a caller holding the current provider callbacks
    const [a, b] = await seed([
      { label: "A", value: "select 1" },
      { label: "B", value: "select 2" },
    ])
    renderProvider()
    await waitForReady()
    const originalEditor = editor

    // When a user closes one tab and deletes the other before either finishes
    await act(async () => {
      await Promise.all([
        originalEditor.closeBuffer(a),
        originalEditor.deleteBuffer(b),
      ])
    })

    // Then the last open tab survives and the user sees why deletion stopped
    expect(await openPositions()).toEqual([["B", 0]])
    expect(toastError).toHaveBeenCalledWith(
      "Cannot close or delete the only open tab. Create another tab first.",
    )
  })

  it("allows deleting history and the AI diff beside the last open tab", async () => {
    // Given one open user tab, a closed tab and the internal AI diff
    const [, closed, diff] = await seed([
      { label: "A", value: "select 1" },
      { archived: true, position: -1, value: "select 2" },
      { isPreviewBuffer: true },
    ])
    renderProvider()
    await waitForReady()

    // When the closed tab and internal diff are deleted
    await act(async () => {
      await Promise.all([
        editor.deleteBuffer(closed),
        editor.deleteBuffer(diff, true, "agent"),
      ])
    })

    // Then only the user's open tab remains
    expect(await openPositions()).toEqual([["A", 0]])
    expect(await db.buffers.count()).toBe(1)
  })

  it("closes the gap in the open tabs' positions", async () => {
    // Given three open tabs
    const [, b] = await seed([
      { label: "A", value: "a" },
      { label: "B", value: "b" },
      { label: "C", value: "c" },
    ])
    renderProvider()
    await waitForReady()

    // When the middle tab is closed by an agent
    await act(() => editor.archiveBuffer(b, "agent"))

    // Then the remaining tabs keep consecutive positions
    expect(await openPositions()).toEqual([
      ["A", 0],
      ["C", 1],
    ])
  })
})

describe("EditorProvider: user actions", () => {
  let seen: UserActionEvent[] = []
  let off: () => void = () => undefined

  beforeEach(() => {
    seen = []
    off = on("user-action", (event) => seen.push(event))
  })

  afterEach(() => off())

  const tabEvents = () =>
    seen.filter(
      (event) =>
        event.kind === "user_archived_tab" || event.kind === "user_deleted_tab",
    )

  it("reports the user's closes and deletes of any tab kind", async () => {
    // Given two SQL tabs next to the active one
    const [, a, b] = await seed([
      { value: "x" },
      { label: "A", value: "a" },
      { label: "B", value: "b" },
    ])
    renderProvider()
    await waitForReady()

    // When the user closes one and deletes the other
    await act(() => editor.closeBuffer(a))
    await act(() => editor.deleteBuffer(b))

    // Then both are reported, with their kind and label
    expect(tabEvents()).toEqual([
      { kind: "user_archived_tab", bufferId: a, tabKind: "sql", label: "A" },
      { kind: "user_deleted_tab", bufferId: b, tabKind: "sql", label: "B" },
    ])
  })

  it("does not report the agent's own closes and deletes", async () => {
    // Given two SQL tabs next to the active one
    const [, a, b] = await seed([
      { value: "x" },
      { label: "A", value: "a" },
      { label: "B", value: "b" },
    ])
    renderProvider()
    await waitForReady()

    // When an agent closes one and deletes the other
    await act(() => editor.archiveBuffer(a, "agent"))
    await act(() => editor.deleteBuffer(b, true, "agent"))

    // Then nothing is reported back as a user action
    expect(tabEvents()).toEqual([])
  })
})

describe("EditorProvider: example dashboards", () => {
  it("turns a notebook whose example was removed into a regular notebook", async () => {
    // Given an open notebook linked to an example that is no longer configured
    const [, notebook] = await seed([
      { value: "select 1" },
      {
        label: "Old example",
        notebookViewState: { cells: [] },
        templateId: "removed",
      },
    ])
    renderProvider({
      exampleDashboards: [{ id: "other", title: "Other", path: "x.json" }],
    })
    await waitForReady()

    // Then the link is dropped
    await waitFor(async () =>
      expect((await db.buffers.get(notebook))?.templateId).toBeUndefined(),
    )

    // And closing it keeps it in history instead of deleting it
    await act(() => editor.closeBuffer(notebook))
    const stored = await db.buffers.get(notebook)
    expect(stored?.archived).toBe(true)
  })

  it("keeps the link of a notebook whose example is still configured", async () => {
    const [, notebook] = await seed([
      { value: "select 1" },
      {
        label: "Trades",
        notebookViewState: { cells: [] },
        templateId: "trades",
      },
    ])
    localStorage.setItem(StoreKey.EXAMPLE_DASHBOARD_AUTO_OPENED, "true")
    renderProvider({
      exampleDashboards: [{ id: "trades", title: "Trades", path: "t.json" }],
    })
    await waitForReady()
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    expect((await db.buffers.get(notebook))?.templateId).toBe("trades")
  })

  it("opens one copy of an example however often it is activated while loading", async () => {
    // Given an example whose file is still being fetched
    await seed([{ value: "select 1" }])
    localStorage.setItem(StoreKey.EXAMPLE_DASHBOARD_AUTO_OPENED, "true")
    let respond: (response: Response) => void = () => undefined
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve
        }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const example = { id: "trades", title: "Trades", path: "t.json" }
    renderProvider({ exampleDashboards: [example] })
    await waitForReady()

    // When it is activated twice before the file arrives
    let first: Promise<void> = Promise.resolve()
    let second: Promise<void> = Promise.resolve()
    act(() => {
      first = editor.openExampleDashboard(example)
    })
    act(() => {
      second = editor.openExampleDashboard(example)
    })

    // Then it is reported as loading and fetched once
    expect(editor.openingExampleIds).toEqual(["trades"])
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // And once the file arrives, one notebook exists
    respond(new Response(JSON.stringify(exampleFile("Trades"))))
    await act(async () => {
      await Promise.all([first, second])
    })
    const copies = (await bufferStore.getAll()).filter(
      (b) => b.templateId === "trades",
    )
    expect(copies).toHaveLength(1)
    expect(editor.openingExampleIds).toEqual([])
  })

  it("loads a delayed example in the background when a script locks tabs", async () => {
    // Given an example starts loading while the SQL tab is active
    const [scriptId] = await seed([
      { label: "Script", value: "select 1; select 2;" },
    ])
    localStorage.setItem(StoreKey.EXAMPLE_DASHBOARD_AUTO_OPENED, "true")
    let respond: (response: Response) => void = () => undefined
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (respond = resolve))),
    )
    const example = { id: "trades", title: "Trades", path: "t.json" }
    renderProvider({ exampleDashboards: [example] })
    await waitForReady()
    let opening = Promise.resolve()
    act(() => {
      opening = editor.openExampleDashboard(example)
    })

    // When the file arrives after a script locks tab changes
    act(() => editor.setTabsDisabled(true))
    await act(async () => {
      respond(new Response(JSON.stringify(exampleFile("Trades"))))
      await opening
    })

    // Then the example loads without replacing the running SQL tab
    const examples = (await bufferStore.getAll()).filter(
      (buffer) => buffer.templateId === example.id,
    )
    expect(examples).toHaveLength(1)
    expect(editor.tabsDisabled).toBe(true)
    expect(editor.activeBuffer.id).toBe(scriptId)
    expect(await activeId()).toBe(scriptId)
    expect(editor.openingExampleIds).toEqual([])

    // And the user can activate the loaded example after the script finishes
    act(() => editor.setTabsDisabled(false))
    await act(() => editor.openExampleDashboard(example))
    expect(editor.activeBuffer.id).toBe(examples[0].id)
  })

  it("places a delayed example after tabs created while its file loads", async () => {
    // Given an example whose file is still being fetched
    await seed([{ label: "Initial", value: "select 1" }])
    localStorage.setItem(StoreKey.EXAMPLE_DASHBOARD_AUTO_OPENED, "true")
    let respond: (response: Response) => void = () => undefined
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (respond = resolve))),
    )
    const example = { id: "trades", title: "Trades", path: "t.json" }
    renderProvider({ exampleDashboards: [example] })
    await waitForReady()
    let opening = Promise.resolve()
    act(() => {
      opening = editor.openExampleDashboard(example)
    })

    // When two other tabs open before the response arrives
    await act(async () => {
      await editor.addBuffer({ label: "First" })
    })
    await act(async () => {
      await editor.addBuffer({ label: "Second" })
    })
    await act(async () => {
      respond(new Response(JSON.stringify(exampleFile("Trades"))))
      await opening
    })

    // Then the example receives the next free position
    expect(await openPositions()).toEqual([
      ["Initial", 0],
      ["First", 1],
      ["Second", 2],
      ["Trades", 3],
    ])
    expect(editor.activeBuffer.templateId).toBe("trades")
  })

  it("shows a spinner while a first visitor's example loads", async () => {
    // Given a fresh workspace on a showcase deployment, with a slow file
    await seed([{ value: "" }])
    let respond: (response: Response) => void = () => undefined
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            respond = resolve
          }),
      ),
    )
    renderProvider({
      exampleDashboards: [{ id: "trades", title: "Trades", path: "t.json" }],
    })

    // Then a spinner stands in for the console
    expect(await findHook("example-dashboard-loading")).toBeTruthy()
    expect(queryHook("editor-ready")).toBeNull()

    // When the file arrives, the example opens as the active tab
    respond(new Response(JSON.stringify(exampleFile("Trades"))))
    await waitFor(() => expect(editor.activeBuffer.templateId).toBe("trades"))
    await waitFor(() =>
      expect(queryHook("example-dashboard-loading")).toBeNull(),
    )
  })

  it("reports a first visitor's example that cannot be loaded and opens the stored tab", async () => {
    // Given a fresh workspace on a showcase deployment whose file is missing
    await seed([{ label: "SQL", value: "" }])
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 404 }))),
    )
    renderProvider({
      exampleDashboards: [{ id: "trades", title: "Trades", path: "t.json" }],
    })

    // Then the stored tab opens and the failure is reported, once
    await waitForReady()
    expect(editor.activeBuffer.label).toBe("SQL")
    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining('Could not open the example dashboard "Trades"'),
    )
    expect(localStorage.getItem(StoreKey.EXAMPLE_DASHBOARD_AUTO_OPENED)).toBe(
      "true",
    )
  })
})

describe("EditorProvider: schema Query", () => {
  it.each([false, true])(
    "preserves the running tab when Query targets a notebook (existing: %s)",
    async (existing) => {
      // Given a script locks tab changes, with or without a matching notebook
      const [scriptId] = await seed([
        { label: "Script", value: "select 1; select 2;" },
        ...(existing
          ? [
              {
                label: "trades",
                notebookViewState: {
                  cells: [{ id: "analysis", position: 0, value: "select 99" }],
                },
              },
            ]
          : []),
      ])
      renderProvider()
      await waitForReady()
      act(() => editor.setTabsDisabled(true))
      const stored = await bufferStore.getAll()

      // When the schema requests a table notebook
      await act(() =>
        editor.openTableNotebook({ name: "trades", designatedTimestamp: "ts" }),
      )

      // Then neither the active tab nor the stored tabs change
      expect(editor.activeBuffer.id).toBe(scriptId)
      expect(await activeId()).toBe(scriptId)
      expect(await bufferStore.getAll()).toEqual(stored)
    },
  )

  it("creates one notebook for a table however often Query is clicked", async () => {
    await seed([{ value: "select 1" }])
    renderProvider()
    await waitForReady()

    // When Query is clicked twice before the first notebook exists
    await act(async () => {
      await Promise.all([
        editor.openTableNotebook({ name: "trades", designatedTimestamp: "ts" }),
        editor.openTableNotebook({ name: "trades", designatedTimestamp: "ts" }),
      ])
    })

    // Then one notebook is created
    const notebooks = (await bufferStore.getAll()).filter(
      (b) => b.label === "trades" && b.notebookViewState,
    )
    expect(notebooks).toHaveLength(1)
  })
})
