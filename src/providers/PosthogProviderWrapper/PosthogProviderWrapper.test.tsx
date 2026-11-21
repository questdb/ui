// @vitest-environment jsdom
import React from "react"
import { render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { PosthogProviderWrapper } from "./index"

const { captureOptions, useSettings } = vi.hoisted(() => ({
  captureOptions: vi.fn(),
  useSettings: vi.fn(),
}))

vi.mock("../SettingsProvider", () => ({ useSettings }))
vi.mock("posthog-js/react", () => ({
  PostHogProvider: ({
    children,
    options,
  }: {
    children: React.ReactNode
    options: unknown
  }) => {
    captureOptions(options)
    return children
  },
}))

it("disables automatic analytics when the server disables PostHog despite a configured key", () => {
  // Given
  useSettings.mockReturnValue({
    settings: { "posthog.enabled": false, "posthog.api.key": "test-key" },
  })

  // When
  render(<PosthogProviderWrapper>Console</PosthogProviderWrapper>)

  // Then
  expect(screen.getByText("Console")).toBeTruthy()
  expect(captureOptions).toHaveBeenCalledWith(
    expect.objectContaining({
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_persistence: true,
      disable_session_recording: true,
    }),
  )
})
