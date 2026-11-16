// @vitest-environment jsdom
import "../auth/support/authHarness"
import React from "react"
import { act, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Provider, useSelector } from "react-redux"
import { applyMiddleware, createStore } from "redux"
import { createEpicMiddleware } from "redux-observable"
import { Subject } from "rxjs"
import { takeUntil } from "rxjs/operators"
import { ThemeProvider } from "styled-components"
import { darkTheme } from "../../../src/theme"
import rootReducer from "../../../src/store/reducers"
import rootEpic from "../../../src/store/epics"
import selectors from "../../../src/store/selectors"
import { SettingsProvider } from "../../../src/providers/SettingsProvider"
import { QuestProvider } from "../../../src/providers/QuestProvider"
import { stop, trackEvent } from "../../../src/modules/ConsoleEventTracker"
import type { StoreAction, StoreShape } from "../../../src/types"

const stopEpics = new Subject<void>()

const ConfigConsumer = () => {
  const config = useSelector(selectors.telemetry.getConfig)
  return <output>{config?.id ?? "Waiting for telemetry config"}</output>
}

afterEach(() => {
  stopEpics.next()
  stop()
})

describe("Authenticated telemetry startup", () => {
  for (const [release, enabled] of [
    ["OSS", false],
    ["EE", false],
    ["OSS", true],
  ] as const) {
    it(`${release} ${enabled ? "starts enabled telemetry with server metadata" : "does not upload disabled SQL or console events"}`, async () => {
      // Given
      vi.useFakeTimers({
        toFake: [
          "Date",
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
        ],
      })
      const requests: Array<{
        path: string
        body: Record<string, unknown>
        sql: string | null
      }> = []
      let authenticate!: () => void
      const authentication = new Promise<void>((resolve) => {
        authenticate = resolve
      })
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string, init?: RequestInit) => {
          const url = new URL(input, location.href)
          requests.push({
            path: url.pathname,
            body: init?.body
              ? (JSON.parse(init.body as string) as Record<string, unknown>)
              : {},
            sql: url.searchParams.get("query"),
          })
          if (url.pathname === "/settings")
            return Response.json({
              config: {
                "release.type": release,
                "acl.enabled": true,
                "acl.basic.auth.realm.enabled": false,
              },
            })
          if (url.pathname === "/warnings") return Response.json([])
          if (url.pathname === "/assets/console-configuration.json")
            return Response.json({})
          if (url.pathname.startsWith("/assets/"))
            throw new TypeError("Image preload is outside this fixture")
          if (url.pathname === "/exec") {
            const sql = url.searchParams.get("query")
            if (sql === "SELECT 1") await authentication
            if (sql === "telemetry_config limit -1")
              return Response.json({
                columns: ["id", "enabled", "version", "os", "package"].map(
                  (name) => ({
                    name,
                    type: name === "enabled" ? "BOOLEAN" : "STRING",
                  }),
                ),
                dataset: [
                  ["mock-id-123", enabled, "1.0.0", "mock-os", "mock-package"],
                ],
                count: 1,
              })
            return Response.json({
              columns: [{ name: "x", type: "LONG" }],
              dataset: [[1]],
              count: 1,
            })
          }
          if (
            url.pathname === "/config" ||
            url.pathname === "/console-events-config"
          )
            return Response.json({ lastUpdated: null })
          if (
            ["/add", "/add-ent", "/add-console-events"].includes(url.pathname)
          )
            return Response.json({})
          throw new Error(`Unexpected request: ${input}`)
        }),
      )
      await trackEvent("help_open")
      const epic = createEpicMiddleware<StoreAction, StoreAction, StoreShape>()
      const store = createStore(rootReducer, applyMiddleware(epic))
      epic.run((...args) => rootEpic(...args).pipe(takeUntil(stopEpics)))
      render(
        <ThemeProvider theme={darkTheme}>
          <Provider store={store}>
            <SettingsProvider>
              <QuestProvider>
                <ConfigConsumer />
              </QuestProvider>
            </SettingsProvider>
          </Provider>
        </ThemeProvider>,
      )
      await act(async () => {
        await vi.waitFor(() =>
          expect(requests.some((request) => request.sql === "SELECT 1")).toBe(
            true,
          ),
        )
      })
      expect(
        requests.filter(
          (request) => request.sql === "telemetry_config limit -1",
        ),
      ).toHaveLength(0)

      // When
      await act(async () => {
        authenticate()
        await vi.waitFor(() =>
          expect(store.getState().telemetry.config?.id).toBe("mock-id-123"),
        )
      })

      // Then
      expect(document.querySelector("output")).toHaveTextContent("mock-id-123")
      const byPath = (path: string) =>
        requests.filter((request) => request.path === path)
      if (enabled) {
        await act(async () => {
          await vi.waitFor(() => expect(byPath("/config")).toHaveLength(1))
        })
        await act(async () => {
          await vi.waitFor(() =>
            expect(byPath("/console-events-config").length).toBeGreaterThan(0),
          )
        })
        for (const path of ["/config", "/add-ent"])
          expect(byPath(path)[0].body).toMatchObject({
            id: "mock-id-123",
            enabled: true,
            version: "1.0.0",
            os: "mock-os",
            package: "mock-package",
          })
      } else {
        expect(byPath("/config")).toHaveLength(0)
        expect(byPath("/add-ent")).toHaveLength(release === "EE" ? 1 : 0)
        expect(byPath("/console-events-config")).toHaveLength(0)
      }
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_600_001)
      })
      expect(byPath("/add")).toHaveLength(0)
      expect(
        requests.filter((request) => request.sql?.includes("with tel as")),
      ).toHaveLength(0)
      if (!enabled) {
        expect(byPath("/config")).toHaveLength(0)
        expect(byPath("/add-console-events")).toHaveLength(0)
        expect(byPath("/console-events-config")).toHaveLength(0)
      }
    })
  }
})
