// @vitest-environment jsdom
import React from "react"
import { fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../test/component"
import { SearchableSelect } from "./index"

const openSearch = async (onSelect: () => void) => {
  renderComponent(
    <SearchableSelect
      options={[{ label: "alpha", value: "alpha" }]}
      value=""
      onSelect={onSelect}
      onReset={() => undefined}
      placeholder="Pick a column"
      ariaLabel="Column"
    />,
  )
  await userEvent.click(screen.getByRole("button", { name: "Column" }))
  const search = screen.getByRole("combobox", { name: "Column" })
  await userEvent.type(search, "alp")
  return search
}

describe("SearchableSelect", () => {
  it("does not select on the Enter that confirms an IME composition", async () => {
    // Given
    const onSelect = vi.fn()
    const search = await openSearch(onSelect)

    // When WebKit sends the confirming Enter after compositionend
    fireEvent.keyDown(search, { key: "Enter", keyCode: 229 })

    // Then
    expect(onSelect).not.toHaveBeenCalled()

    // When the user presses Enter again
    await userEvent.keyboard("{Enter}")

    // Then
    expect(onSelect).toHaveBeenCalledWith("alpha", expect.anything())
  })
})
