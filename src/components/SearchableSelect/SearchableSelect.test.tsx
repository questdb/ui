// @vitest-environment jsdom
import React from "react"
import { fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { VirtuosoMockContext } from "react-virtuoso"
import { renderComponent } from "../../test/component"
import { SearchableSelect } from "."

const options = [
  { label: "price", value: "price" },
  { label: "amount", value: "amount" },
]

const open = () => {
  fireEvent.click(screen.getByRole("button", { name: "Series" }))
  return screen.getByRole("combobox", { name: "Series" })
}

describe("SearchableSelect without creating options", () => {
  it("never offers the typed name and only picks listed options", () => {
    // Given
    const onSelect = vi.fn()
    renderComponent(
      <SearchableSelect
        ariaLabel="Series"
        options={options}
        value="None selected"
        selectedValues={[]}
        allowCreate={false}
        onSelect={onSelect}
        onReset={vi.fn()}
      />,
    )
    const input = open()
    // When
    fireEvent.change(input, { target: { value: "volume" } })
    fireEvent.keyDown(input, { key: "Enter" })
    // Then
    expect(screen.queryByText(/Add “volume”/)).toBeNull()
    expect(screen.getByRole("status")).toHaveTextContent(
      "No options matched the filter",
    )
    expect(onSelect).not.toHaveBeenCalled()
    expect(input).not.toHaveAttribute(
      "placeholder",
      expect.stringContaining("Enter to add"),
    )
  })

  it("picks the matching option on Enter", () => {
    // Given
    const onSelect = vi.fn()
    renderComponent(
      <SearchableSelect
        ariaLabel="Series"
        options={options}
        value="None selected"
        selectedValues={[]}
        allowCreate={false}
        onSelect={onSelect}
        onReset={vi.fn()}
      />,
    )
    const input = open()
    // When
    fireEvent.change(input, { target: { value: "amo" } })
    fireEvent.keyDown(input, { key: "Enter" })
    // Then
    expect(onSelect).toHaveBeenCalledWith("amount", options[1])
  })
})

describe("SearchableSelect selection order", () => {
  const columns = [
    { label: "alpha", value: "alpha" },
    { label: "beta", value: "beta" },
    { label: "gamma", value: "gamma" },
    { label: "delta", value: "delta" },
  ]

  const optionLabels = () =>
    screen.getAllByRole("option").map((option) => option.textContent)

  const Multi = () => {
    const [selected, setSelected] = React.useState(["gamma"])
    return (
      <SearchableSelect
        ariaLabel="Series"
        options={columns}
        value={selected.join(", ")}
        selectedValues={selected}
        onSelect={(name) =>
          setSelected((current) =>
            current.includes(name)
              ? current.filter((v) => v !== name)
              : [...current, name],
          )
        }
        onReset={() => setSelected([])}
      />
    )
  }

  // jsdom has no layout; give Virtuoso a viewport so it renders every row.
  const renderList = () =>
    renderComponent(
      <VirtuosoMockContext.Provider
        value={{ viewportHeight: 1000, itemHeight: 32 }}
      >
        <Multi />
      </VirtuosoMockContext.Provider>,
    )

  it("lists the selection first and keeps the order while open", () => {
    // Given
    renderList()
    // When
    open()
    // Then
    expect(optionLabels()).toEqual(["gamma", "alpha", "beta", "delta"])

    // When
    fireEvent.click(screen.getByRole("option", { name: "beta" }))
    fireEvent.click(screen.getByRole("option", { name: "gamma" }))
    // Then
    expect(optionLabels()).toEqual(["gamma", "alpha", "beta", "delta"])
    expect(screen.getByRole("option", { name: "gamma" })).toHaveAttribute(
      "aria-selected",
      "false",
    )
  })

  it("pins the new selection when reopened", () => {
    // Given
    renderList()
    const input = open()
    fireEvent.click(screen.getByRole("option", { name: "delta" }))
    // When
    fireEvent.keyDown(input, { key: "Escape" })
    open()
    // Then
    expect(optionLabels()).toEqual(["gamma", "delta", "alpha", "beta"])
  })

  it("lists matches in alphabetical order while searching", () => {
    // Given
    renderList()
    const input = open()
    // When
    fireEvent.change(input, { target: { value: "a" } })
    // Then
    expect(optionLabels()).toEqual([
      "Add “a”",
      "alpha",
      "beta",
      "delta",
      "gamma",
    ])
  })
})

describe("SearchableSelect and input methods", () => {
  it("does not select on the Enter that confirms an IME composition", async () => {
    // Given
    const onSelect = vi.fn()
    renderComponent(
      <VirtuosoMockContext.Provider
        value={{ viewportHeight: 400, itemHeight: 32 }}
      >
        <SearchableSelect
          options={[{ label: "alpha", value: "alpha" }]}
          value=""
          onSelect={onSelect}
          onReset={() => undefined}
          placeholder="Pick a column"
          ariaLabel="Column"
        />
      </VirtuosoMockContext.Provider>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Column" }))
    const search = screen.getByRole("combobox", { name: "Column" })
    await userEvent.type(search, "alp")

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
