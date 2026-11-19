// @vitest-environment jsdom
import { renderComponent } from "../../../../test/component"
import React from "react"
import { act, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { createSettingsDrawerSessionStore } from "./settingsDrawerSessionStore"
import { useSettingsDrawerSession } from "./useSettingsDrawerSession"
import { sameDrawSettings, type DrawSettings } from "../CellChart/drawSettings"

type Session = { configAtOpen: DrawSettings | undefined; draft: string | null }

const chartConfig = { xColumn: null, queries: [] }

const Owner = ({
  sessions,
  config,
}: {
  sessions: ReturnType<typeof createSettingsDrawerSessionStore<Session>>
  config: DrawSettings
}) => {
  const drawer = useSettingsDrawerSession<DrawSettings, string>({
    sessions,
    cellId: "c",
    config,
    sameConfig: sameDrawSettings,
    openEvent: EventType.NOTEBOOK_CELL_OPEN_CHART_SETTINGS,
    onOpen: () => undefined,
    onCancel: () => undefined,
    changedWhileOpenMessage: "changed",
  })
  return <span>{drawer.open ? "open" : "closed"}</span>
}

describe("settings drawer session", () => {
  it("keeps the drawer open when its owner remounts with the same settings", () => {
    // Given an open drawer
    const sessions = createSettingsDrawerSessionStore<Session>()
    const first = renderComponent(
      <Owner sessions={sessions} config={{ chartConfig }} />,
    )
    act(() =>
      eventBus.publish(EventType.NOTEBOOK_CELL_OPEN_CHART_SETTINGS, {
        cellId: "c",
        mode: "open",
      }),
    )
    expect(screen.getByText("open")).toBeVisible()

    // When the cell remounts (maximize) and assembles a new settings object
    first.unmount()
    renderComponent(<Owner sessions={sessions} config={{ chartConfig }} />)

    // Then the drawer is still open
    expect(screen.getByText("open")).toBeVisible()
  })

  it("closes the drawer when a field changes elsewhere", () => {
    // Given an open drawer
    const sessions = createSettingsDrawerSessionStore<Session>()
    const view = renderComponent(
      <Owner sessions={sessions} config={{ chartConfig }} />,
    )
    act(() =>
      eventBus.publish(EventType.NOTEBOOK_CELL_OPEN_CHART_SETTINGS, {
        cellId: "c",
        mode: "open",
      }),
    )

    // When the assistant sets formats
    view.rerender(
      <Owner
        sessions={sessions}
        config={{ chartConfig, formats: { price: { decimals: 2 } } }}
      />,
    )

    // Then it closes
    expect(screen.getByText("closed")).toBeVisible()
  })
})
