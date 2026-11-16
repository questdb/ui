// @vitest-environment jsdom
import "../auth/support/authHarness"
import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ThemeProvider } from "styled-components"
import { darkTheme } from "../../../src/theme"
import { SettingsProvider } from "../../../src/providers/SettingsProvider"
import { Warnings } from "../../../src/scenes/Layout/warning"

describe("Warnings settings integration", () => {
  for (const warnings of [
    [],
    [{ tag: "UNSUPPORTED FILE SYSTEM", warning: "Unsupported file system" }],
  ]) {
    it(`renders ${warnings.length ? "the server warning" : "no warning after an empty response"}`, async () => {
      // Given
      const requests: string[] = []
      vi.stubGlobal(
        "fetch",
        vi.fn((input: string) => {
          requests.push(input)
          if (input === "settings")
            return Promise.resolve(
              Response.json({ config: { "release.type": "OSS" } }),
            )
          if (input === "warnings")
            return Promise.resolve(Response.json(warnings))
          if (input === "assets/console-configuration.json")
            return Promise.resolve(Response.json({}))
          return Promise.reject(
            new TypeError("Image preload is outside this fixture"),
          )
        }),
      )

      // When
      render(
        <ThemeProvider theme={darkTheme}>
          <SettingsProvider>
            <Warnings />
            <span>Settings loaded</span>
          </SettingsProvider>
        </ThemeProvider>,
      )

      // Then
      await screen.findByText("Settings loaded")
      expect(requests).toContain("warnings")
      if (warnings.length)
        await waitFor(() =>
          expect(
            document.querySelector('[data-hook="warning-text"]'),
          ).toHaveTextContent("Unsupported file system"),
        )
      else
        await waitFor(() =>
          expect(document.querySelector('[data-hook="warnings"]')).toBeNull(),
        )
    })
  }
})
