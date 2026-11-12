// @vitest-environment jsdom
import React from "react"
import { act, waitFor } from "@testing-library/react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { findHook, queryHook, renderComponent } from "../../test/component"
import { db } from "../../store/db"
import { bufferStore, makeBuffer, type Buffer } from "../../store/buffers"
import { SettingContext } from "../SettingsProvider/context"
import type { ConsoleConfig } from "../SettingsProvider/types"
import { StoreKey } from "../../utils/localStorage/types"
import { EditorProvider, useEditor, type EditorContext } from "./index"

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

const exampleFile = (label: string) => [
  {
    label,
    notebookViewState: {
      cells: [{ id: "c1", position: 0, value: "select 1" }],
    },
  },
]

const renderProvider = (consoleConfig: ConsoleConfig = {}) =>
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
