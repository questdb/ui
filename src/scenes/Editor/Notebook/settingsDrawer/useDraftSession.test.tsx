// @vitest-environment jsdom
import { renderComponent } from "../../../../test/component"
import React from "react"
import { act } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useDraftSession, type DraftSession } from "./useDraftSession"

type Props = { open: boolean; config: object; draft: string; note: string }

const CONFIG = {}

const setup = (initial: Partial<Props> = {}) => {
  let props: Props = {
    open: true,
    config: CONFIG,
    draft: "a",
    note: "",
    ...initial,
  }
  const seen: { session: DraftSession<{ draft: string }> | null } = {
    session: null,
  }
  const Drawer = (p: Props) => {
    seen.session = useDraftSession({
      open: p.open,
      config: p.config,
      sameConfig: Object.is,
      inputs: [p.draft],
      live: { draft: p.draft },
    })
    return null
  }
  const view = renderComponent(<Drawer {...props} />)
  return {
    get session() {
      return seen.session!
    },
    rerender: (patch: Partial<Props>) => {
      props = { ...props, ...patch }
      view.rerender(<Drawer {...props} />)
    },
    unmount: () => view.unmount(),
  }
}

const deferred = () => {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe("draft session", () => {
  it("keeps a ticket current until the draft changes, and reads the live draft", () => {
    const drawer = setup()
    const ticket = drawer.session.begin()
    drawer.rerender({ note: "an unrelated prop" })
    expect(drawer.session.isCurrent(ticket)).toBe(true)

    drawer.rerender({ draft: "b" })
    expect(drawer.session.isLive(ticket)).toBe(true)
    expect(drawer.session.isCurrent(ticket)).toBe(false)
    expect(drawer.session.read().draft).toBe("b")
  })

  it.each([
    ["closes", { open: false }],
    ["has its saved settings changed", { config: {} }],
  ])("ends the session when the drawer %s", (_, patch) => {
    const drawer = setup()
    const ticket = drawer.session.begin()
    drawer.rerender(patch)
    expect(drawer.session.isLive(ticket)).toBe(false)
  })

  it("ends the session on a reopen and on an unmount", () => {
    const drawer = setup()
    const first = drawer.session.begin()
    drawer.rerender({ open: false })
    drawer.rerender({ open: true })
    expect(drawer.session.isLive(first)).toBe(false)
    const second = drawer.session.begin()
    expect(drawer.session.isCurrent(second)).toBe(true)
    const { session } = drawer
    drawer.unmount()
    expect(session.isLive(second)).toBe(false)
  })

  it("is busy while its own step waits, and an ended session's step does not clear a newer one's", async () => {
    // Given a step waiting in the first session
    const drawer = setup()
    const first = deferred()
    let firstDone: Promise<void> = Promise.resolve()
    act(() => {
      firstDone = drawer.session.wait(drawer.session.begin(), first.promise)
    })
    expect(drawer.session.busy).toBe(true)

    // When the drawer reopens, it is not busy; a step of the new session is
    drawer.rerender({ open: false })
    expect(drawer.session.busy).toBe(false)
    drawer.rerender({ open: true })
    const second = deferred()
    let secondDone: Promise<void> = Promise.resolve()
    act(() => {
      secondDone = drawer.session.wait(drawer.session.begin(), second.promise)
    })
    expect(drawer.session.busy).toBe(true)

    // Then the first step ending leaves the second busy, until it ends
    await act(async () => {
      first.resolve()
      await firstDone
    })
    expect(drawer.session.busy).toBe(true)
    expect(drawer.session.isBusy()).toBe(true)
    await act(async () => {
      second.resolve()
      await secondDone
    })
    expect(drawer.session.busy).toBe(false)
    expect(drawer.session.isBusy()).toBe(false)
  })
})
