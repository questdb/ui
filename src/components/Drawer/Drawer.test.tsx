// @vitest-environment jsdom
import React from "react"
import { Provider, useDispatch, useSelector } from "react-redux"
import { createStore } from "redux"
import { renderComponent, getHook } from "../../test/component"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import rootReducer from "../../store/reducers"
import { actions, selectors } from "../../store"
import { Button } from "../Button"
import { Drawer } from "."
import { DRAWER_ESCAPE_EVENT, escapeClaimOf } from "./escapeClaim"
import { DrawerHost } from "../../scenes/Schema/TableDetailsDrawer/test/DrawerHost"
vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))

const Panels = () => {
  const dispatch = useDispatch()
  const active = useSelector(selectors.console.getActiveSidebar)
  return (
    <Drawer
      mode="side"
      title="Panel history"
      trigger={<span />}
      open={active !== null}
    >
      <Button
        onClick={() =>
          dispatch(
            actions.console.pushSidebarHistory({
              type: "tableDetails",
              payload: { tableName: "trades", kind: "table" },
            }),
          )
        }
      >
        Inspect trades
      </Button>
      <Button
        onClick={() =>
          dispatch(actions.console.pushSidebarHistory({ type: "aiChat" }))
        }
      >
        Open chat
      </Button>
      <Button
        onClick={() =>
          dispatch(actions.console.pushSidebarHistory({ type: "news" }))
        }
      >
        Open news
      </Button>
      <Button
        onClick={() =>
          dispatch(
            actions.console.pushSidebarHistory({
              type: "tableDetails",
              payload: { tableName: "prices", kind: "table" },
            }),
          )
        }
      >
        Inspect prices
      </Button>

      <div data-hook="current-panel">
        {active?.type === "tableDetails"
          ? active.payload?.tableName
          : active?.type}
      </div>
    </Drawer>
  )
}

describe("drawer history controls", () => {
  it("disables Forward after a new target replaces the forward branch", async () => {
    // Given
    const store = createStore(rootReducer)
    store.dispatch(
      actions.console.pushSidebarHistory({
        type: "tableDetails",
        payload: { tableName: "trades", kind: "table" },
      }),
    )
    renderComponent(
      <Provider store={store}>
        <DrawerHost>
          <Panels />
        </DrawerHost>
      </Provider>,
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Inspect trades" }),
    )
    await userEvent.click(screen.getByRole("button", { name: "Open chat" }))
    await userEvent.click(screen.getByRole("button", { name: "Open news" }))
    expect(getHook("current-panel")).toHaveTextContent("news")
    // When
    await userEvent.click(getHook("sidebar-back-button"))
    await userEvent.click(getHook("sidebar-back-button"))
    // Then
    expect(getHook("current-panel")).toHaveTextContent("trades")
    expect(getHook("sidebar-back-button")).toBeDisabled()
    expect(getHook("sidebar-forward-button")).toBeEnabled()
    // When
    await userEvent.click(
      screen.getByRole("button", { name: "Inspect prices" }),
    )
    // Then
    expect(getHook("current-panel")).toHaveTextContent("prices")
    expect(getHook("sidebar-forward-button")).toBeDisabled()
    // When
    await userEvent.click(getHook("sidebar-back-button"))
    await userEvent.click(getHook("sidebar-forward-button"))
    // Then
    expect(getHook("current-panel")).toHaveTextContent("prices")
    expect(getHook("sidebar-forward-button")).toBeDisabled()
  })
})

describe("drawer and Escape", () => {
  const SideDrawer = ({
    claim,
    onDismiss,
    onClaimed,
  }: {
    claim: boolean
    onDismiss: () => void
    onClaimed: () => void
  }) => (
    <Drawer
      mode="side"
      title="Chat"
      trigger={<span />}
      open
      onDismiss={onDismiss}
    >
      <section
        {...escapeClaimOf(claim)}
        data-hook="waiting-card"
        ref={(node) => node?.addEventListener(DRAWER_ESCAPE_EVENT, onClaimed)}
      >
        <Button>Answer</Button>
      </section>
    </Drawer>
  )

  it("hands Escape to a card that claims it, and stays open", async () => {
    // Given a card waiting on the user, with focus in it
    const onDismiss = vi.fn()
    const onClaimed = vi.fn()
    renderComponent(
      <Provider store={createStore(rootReducer)}>
        <DrawerHost>
          <SideDrawer claim onDismiss={onDismiss} onClaimed={onClaimed} />
        </DrawerHost>
      </Provider>,
    )
    screen.getByRole("button", { name: "Answer" }).focus()

    // When
    await userEvent.keyboard("{Escape}")

    // Then
    expect(onClaimed).toHaveBeenCalledTimes(1)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it("closes on Escape when no card claims it", async () => {
    // Given
    const onDismiss = vi.fn()
    const onClaimed = vi.fn()
    renderComponent(
      <Provider store={createStore(rootReducer)}>
        <DrawerHost>
          <SideDrawer
            claim={false}
            onDismiss={onDismiss}
            onClaimed={onClaimed}
          />
        </DrawerHost>
      </Provider>,
    )
    screen.getByRole("button", { name: "Answer" }).focus()

    // When
    await userEvent.keyboard("{Escape}")

    // Then
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onClaimed).not.toHaveBeenCalled()
  })
})
