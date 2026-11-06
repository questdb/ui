// @vitest-environment jsdom
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { renderComponent, getHook } from "../../test/component"
import { LocalStorageProvider } from "../../providers/LocalStorageProvider"
import { EditorSettingsModal } from "./"

describe("legacy editor settings", () => {
  it("shows Off when the previous version stored a false selection setting", () => {
    // Given
    localStorage.setItem("editor.runWithSelection", "false")
    // When
    renderComponent(
      <LocalStorageProvider>
        <EditorSettingsModal open onOpenChange={vi.fn()} />
      </LocalStorageProvider>,
    )
    // Then
    expect(getHook("editor-settings-run-with-selection")).toHaveTextContent(
      "Off",
    )
  })
})
