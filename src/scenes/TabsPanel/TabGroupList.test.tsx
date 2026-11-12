import React from "react"
import { ThemeProvider } from "styled-components"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { darkTheme } from "../../theme"
import type { Buffer } from "../../store/buffers"
import { resetDeleteClickGuard } from "../../utils/buffers/deleteClickGuard"

const mocks = vi.hoisted(() => ({
  editor: {
    buffers: [] as unknown[],
    activeBuffer: { id: 1 } as unknown,
    setActiveBuffer: vi.fn(),
    closeBuffer: vi.fn(),
    deleteBuffer: vi.fn(),
    previewBuffer: vi.fn(),
    restoreBuffer: vi.fn(),
  },
}))

vi.mock("../../providers", () => ({ useEditor: () => mocks.editor }))
vi.mock("../../components", () => ({
  IconButton: ({
    label,
    size: _size,
    variant: _variant,
    ...rest
  }: React.ComponentPropsWithoutRef<"span"> & {
    label: string
    size?: string
    variant?: string
    disabled?: boolean
  }) => <span role="button" aria-label={label} {...rest} />,
  Text: ({ children }: React.PropsWithChildren<unknown>) => (
    <span>{children}</span>
  ),
  Tooltip: ({ children }: React.PropsWithChildren<unknown>) => <>{children}</>,
}))
vi.mock("../../components/icons", () => ({ LineChart: () => null }))
vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("../../utils", () => ({
  fetchUserLocale: () => "en-US",
  getLocaleFromLanguage: () => undefined,
}))

import { TabGroupList } from "./TabGroupList"

const buffer = (id: number, label: string, extra: Partial<Buffer> = {}) =>
  ({ id, label, value: "", position: id - 1, ...extra }) as Buffer

let renderer: ReactTestRenderer | undefined

beforeEach(() => {
  resetDeleteClickGuard()
  mocks.editor.deleteBuffer.mockReset()
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

const renderList = (allBuffers: Buffer[], rows: Buffer[]) => {
  mocks.editor.buffers = allBuffers
  act(() => {
    renderer = create(
      <ThemeProvider theme={darkTheme}>
        <TabGroupList rows={rows} />
      </ThemeProvider>,
    )
  })
}

const buttons = (hook: string) =>
  renderer!.root.findAll(
    (node) => node.type === "span" && node.props["data-hook"] === hook,
  )

const buttonDisabled = (hook: string) =>
  Boolean(buttons(hook)[0].props.disabled)

describe("TabGroupList remove gating", () => {
  it("enables Close/Delete when a filter shows one row but other tabs are open", () => {
    const a = buffer(1, "alpha")
    const b = buffer(2, "beta")
    renderList([a, b], [a])

    expect(buttonDisabled("tabs-panel-close")).toBe(false)
    expect(buttonDisabled("tabs-panel-delete")).toBe(false)
  })

  it("disables Close/Delete on the last open tab", () => {
    const a = buffer(1, "alpha")
    renderList([a], [a])

    expect(buttonDisabled("tabs-panel-close")).toBe(true)
    expect(buttonDisabled("tabs-panel-delete")).toBe(true)
  })

  it("does not count closed tabs or the previewed closed tab as open", () => {
    const a = buffer(1, "alpha")
    const closed = buffer(2, "closed", { archived: true, position: -1 })
    const previewed = buffer(3, "previewed", {
      archived: true,
      isTemporary: true,
      position: -1,
    })
    renderList([a, closed, previewed], [a])

    expect(buttonDisabled("tabs-panel-close")).toBe(true)
    expect(buttonDisabled("tabs-panel-delete")).toBe(true)
  })

  it("offers Reopen/Delete on closed rows, and Delete stays enabled for them", () => {
    const a = buffer(1, "alpha")
    const closed = buffer(2, "closed", { archived: true, position: -1 })
    renderList([a, closed], [a, closed])

    expect(buttons("tabs-panel-reopen")).toHaveLength(1)
    expect(buttons("tabs-panel-close")).toHaveLength(1)
    expect(buttons("tabs-panel-delete")[1].props.disabled).toBeFalsy()
  })
})

describe("TabGroupList delete double-click guard", () => {
  it("ignores a second Delete click inside the guard window", () => {
    const a = buffer(1, "alpha")
    const b = buffer(2, "beta")
    const c = buffer(3, "gamma")
    renderList([a, b, c], [a, b, c])

    const click = (index: number) =>
      act(() => {
        ;(
          buttons("tabs-panel-delete")[index].props as {
            onClick: (event: unknown) => void
          }
        ).onClick({ currentTarget: { closest: () => null } })
      })
    click(0)
    // The list re-rendered and the next row is now under the pointer.
    click(1)

    expect(mocks.editor.deleteBuffer).toHaveBeenCalledTimes(1)
    expect(mocks.editor.deleteBuffer).toHaveBeenCalledWith(1, true, "user", {
      focusEditor: false,
    })
  })
})
