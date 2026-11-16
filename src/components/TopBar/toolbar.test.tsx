// @vitest-environment jsdom
import {
  renderComponent,
  getHook,
  findHook,
  queryHook,
  requestUrl,
} from "../../test/component"
import React from "react"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Provider } from "react-redux"
import { createStore } from "redux"
import rootReducer from "../../store/reducers"
import { SettingsProvider } from "../../providers/SettingsProvider"
import { LocalStorageProvider } from "../../providers/LocalStorageProvider"
import { Toolbar } from "./toolbar"
import type { Preferences } from "../../utils/questdb/types"

vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
const hook = (name: string) => getHook(`topbar-instance-${name}`)
const mountToolbar = async (
  readonly = false,
  initial: Preferences = {},
  enterpriseUser?: string,
) => {
  let preferences = initial
  const writes: Preferences[] = []
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input)
    if (url.pathname === "/settings") {
      if (init?.method === "PUT") {
        preferences = JSON.parse(init.body as string) as Preferences
        writes.push(preferences)
        return Promise.resolve(Response.json({}))
      }
      return Promise.resolve(
        Response.json({
          config: {
            "release.type": enterpriseUser ? "EE" : "OSS",
            "http.settings.readonly": readonly,
          },
          preferences,
          "preferences.version": writes.length,
        }),
      )
    }
    if (url.pathname === "/warnings") return Promise.resolve(Response.json([]))
    if (url.pathname === "/assets/console-configuration.json")
      return Promise.resolve(Response.json({}))
    if (url.pathname.startsWith("/assets/"))
      return Promise.reject(
        new Error("Image preload is outside this settings fixture"),
      )
    if (url.pathname === "/exec") {
      const query = url.searchParams.get("query") ?? ""
      if (query.toLowerCase().startsWith("show permissions")) {
        // The server rejects a dotted user name unless it is quoted.
        return Promise.resolve(
          query === `SHOW PERMISSIONS '${enterpriseUser}';`
            ? Response.json({
                columns: [{ name: "permission", type: "STRING" }],
                dataset: [["SETTINGS"]],
                count: 1,
              })
            : Response.json(
                { query, error: "unexpected token [.]", position: 21 },
                { status: 400 },
              ),
        )
      }
      return Promise.resolve(
        Response.json({
          columns: [{ name: "current_user", type: "STRING" }],
          dataset: [[enterpriseUser ?? "admin"]],
          count: 1,
        }),
      )
    }
    throw new Error(`Unexpected request: ${requestUrl(input).href}`)
  })
  vi.stubGlobal("fetch", fetch)
  renderComponent(
    <Provider store={createStore(rootReducer)}>
      <SettingsProvider>
        <LocalStorageProvider>
          <Toolbar />
        </LocalStorageProvider>
      </SettingsProvider>
    </Provider>,
  )
  await findHook("topbar-instance-badge")
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(
        ([input]) =>
          requestUrl(input).searchParams.get("query") === "SELECT current_user",
      ),
    ).toBe(true),
  )
  return { writes, fetch }
}

const openSettings = async () => {
  await userEvent.click(hook("edit-icon"))
  await waitFor(() => expect(hook("name-input")).toHaveFocus())
}

describe("Instance settings", () => {
  it("previews a color, rejects an empty name, and restores the cancelled draft without writing", async () => {
    // Given
    const { writes } = await mountToolbar()
    const originalColor = getComputedStyle(hook("badge")).backgroundColor
    await openSettings()

    // When
    await userEvent.click(hook("color-option-r"))
    expect(getComputedStyle(hook("badge")).backgroundColor).toBe(
      "rgb(199, 7, 45)",
    )
    await userEvent.click(hook("save-button"))

    // Then
    expect(
      await screen.findByText("Instance name is required"),
    ).toBeInTheDocument()
    expect(writes).toEqual([])

    // When
    await userEvent.click(hook("cancel-button"))

    // Then
    await waitFor(() =>
      expect(queryHook("topbar-instance-save-button")).not.toBeInTheDocument(),
    )
    expect(hook("name")).toHaveTextContent("Instance name is not set")
    expect(getComputedStyle(hook("badge")).backgroundColor).toBe(originalColor)
    await openSettings()
    expect(hook("name-input")).toHaveValue("")
    expect(writes).toEqual([])
  })

  it("saves an empty description and omits its tooltip", async () => {
    // Given
    const { writes } = await mountToolbar()
    await openSettings()

    // When
    await userEvent.type(hook("name-input"), "test-instance-1")
    hook("type-select").focus()
    await userEvent.keyboard("{ArrowDown}")
    await userEvent.click(await findHook("topbar-instance-type-option-testing"))
    await userEvent.click(hook("save-button"))

    // Then
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({
      instance_name: "test-instance-1",
      instance_type: "testing",
    })
    expect(writes[0].instance_description ?? "").toBe("")
    await waitFor(() =>
      expect(queryHook("topbar-instance-save-button")).not.toBeInTheDocument(),
    )
    expect(hook("name")).toHaveTextContent("test-instance-1")
    expect(hook("name")).toHaveTextContent("Testing")
    await userEvent.hover(hook("icon"))
    expect(queryHook("topbar-instance-tooltip")).not.toBeInTheDocument()
  })

  it("offers the saved description when the instance icon is hovered", async () => {
    // Given
    await mountToolbar(false, {
      instance_name: "production",
      instance_type: "production",
      instance_description: "Market data",
    })

    // When
    await userEvent.hover(hook("icon"))

    // Then
    expect(await findHook("topbar-instance-tooltip")).toHaveTextContent(
      "Market data",
    )
  })

  it("lets an enterprise user with a dot in their name and SETTINGS permission edit", async () => {
    // Given / When
    const { fetch } = await mountToolbar(false, {}, "john.doe")

    // Then
    await openSettings()
    expect(hook("name-input")).toBeInTheDocument()
    expect(
      fetch.mock.calls.map(([input]) =>
        requestUrl(input).searchParams.get("query"),
      ),
    ).toContain("SHOW PERMISSIONS 'john.doe';")
  })

  it.each([true, false])(
    "honors readonly=%s after settings and identity load",
    async (readonly) => {
      // Given / When
      await mountToolbar(readonly)

      // Then
      if (readonly)
        expect(queryHook("topbar-instance-edit-icon")).not.toBeInTheDocument()
      else {
        await openSettings()
        expect(hook("name-input")).toBeInTheDocument()
      }
    },
  )
})
