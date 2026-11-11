import React from "react"
import { ThemeProvider } from "styled-components"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"
import { darkTheme } from "../../theme"
import type { Buffer } from "../../store/buffers"

const mocks = vi.hoisted(() => ({
  editor: {
    buffers: [] as unknown[],
    activeBuffer: { id: 1 } as unknown,
    setActiveBuffer: vi.fn(),
    closeBuffer: vi.fn(),
    deleteBuffer: vi.fn(),
    reorderBuffer: vi.fn(),
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
}))
vi.mock("../../components/icons", () => ({ LineChart: () => null }))
vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("../../modules/EventBus", () => ({
  eventBus: { publish: vi.fn() },
}))
// Pointer listeners on `document` are irrelevant here; node has no DOM.
vi.mock("./useRowDrag", () => ({
  useRowDrag: () => ({
    drag: null,
    startDrag: vi.fn(),
    consumeDrop: () => false,
  }),
}))

import { OpenTabList } from "./OpenTabList"

const buffer = (id: number, label: string, extra: Partial<Buffer> = {}) =>
  ({ id, label, value: "", position: id - 1, ...extra }) as Buffer

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

const renderList = (allBuffers: Buffer[], shown: Buffer[]) => {
  mocks.editor.buffers = allBuffers
  act(() => {
    renderer = create(
      <ThemeProvider theme={darkTheme}>
        <OpenTabList buffers={shown} reorderable={false} />
      </ThemeProvider>,
    )
  })
}

const buttonDisabled = (hook: string) =>
  Boolean(
    renderer!.root.find(
      (node) => node.type === "span" && node.props["data-hook"] === hook,
    ).props.disabled,
  )

describe("OpenTabList remove gating", () => {
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
})

describe("OpenTabList row semantics", () => {
  it("keeps Close/Delete outside the row's button", () => {
    const a = buffer(1, "alpha")
    const b = buffer(2, "beta")
    renderList([a, b], [a])

    const rowButton = renderer!.root.find(
      (node) =>
        typeof node.type === "string" &&
        node.props["data-hook"] === "tabs-panel-row-button",
    )
    expect(rowButton.props.role).toBe("button")
    expect(
      rowButton.findAll(
        (node) =>
          node !== rowButton &&
          typeof node.type === "string" &&
          node.props.role === "button",
      ),
    ).toHaveLength(0)

    const row = renderer!.root.find(
      (node) =>
        typeof node.type === "string" &&
        node.props["data-hook"] === "tabs-panel-row",
    )
    expect(row.props.role).toBeUndefined()
    expect(
      row
        .findAll(
          (node) =>
            typeof node.type === "string" && node.props.role === "button",
        )
        .map((node): string =>
          String(node.props["aria-label"] ?? node.props["data-hook"]),
        ),
    ).toEqual(["tabs-panel-row-button", "Close tab", "Delete tab"])
  })
})
