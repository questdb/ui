// @vitest-environment jsdom
import { renderComponent } from "../../../../test/component"
import React, { useState } from "react"
import { fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import type { ColumnFormats } from "../../../../utils/formats/columnFormat"
import { ColumnFormatsEditor } from "./ColumnFormatsEditor"
import { darkTheme } from "../../../../theme"

const columns = [
  { name: "symbol", type: "SYMBOL" },
  { name: "price", type: "DOUBLE" },
  { name: "change", type: "DOUBLE" },
  { name: "trend", type: "ARRAY" },
  { name: "ts", type: "TIMESTAMP" },
]

let latest: ColumnFormats | undefined

const Editor = ({
  initial,
  focusColumn,
}: {
  initial?: ColumnFormats
  focusColumn?: string
}) => {
  const [formats, setFormats] = useState(initial)
  latest = formats
  return (
    <ColumnFormatsEditor
      formats={formats}
      onChange={setFormats}
      columns={columns}
      samples={{ price: 63012.456, change: -0.0123 }}
      cellVisuals
      focusColumn={focusColumn}
    />
  )
}

describe("column formats editor", () => {
  it("formats a column the user adds, with a live preview", async () => {
    // Given no formats
    renderComponent(<Editor />)
    expect(screen.getByText("No column has a format yet.")).toBeVisible()

    // When the user formats price as a price with a prefix
    await userEvent.click(
      screen.getByRole("button", { name: /^Format a column/ }),
    )
    await userEvent.click(screen.getByRole("menuitemradio", { name: "price" }))
    await userEvent.click(
      screen.getByRole("button", { name: /^price: show as/ }),
    )
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /^Price \(fixed/ }),
    )
    fireEvent.change(screen.getByPlaceholderText("e.g. $"), {
      target: { value: "$" },
    })

    // Then the preview reads like the grid will, and the format is set
    expect(screen.getByText("$63,012.46")).toBeVisible()
    expect(latest).toEqual({ price: { kind: "price", prefix: "$" } })
  })

  it("colours by thresholds the user adds", async () => {
    // Given a formatted change column
    renderComponent(<Editor initial={{ change: { kind: "percent" } }} />)

    // When the user colours it by thresholds and adds one
    await userEvent.click(
      screen.getByRole("button", { name: /^change: colour/ }),
    )
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "By thresholds" }),
    )
    fireEvent.click(screen.getByRole("button", { name: "+ Add threshold" }))
    fireEvent.change(screen.getByLabelText("change: threshold 2"), {
      target: { value: "0.05" },
    })

    // Then
    expect(latest?.change.thresholds).toEqual([
      { value: 0, tone: "positive" },
      { value: 0.05, tone: "negative" },
    ])
  })

  it("previews a signed value in the text colour the grid uses", () => {
    // Given a change format coloured by sign, and a negative sample
    renderComponent(
      <Editor initial={{ change: { kind: "percent", signTone: true } }} />,
    )

    // When the preview shows the sample
    const preview = screen.getByText("Preview").parentElement!
    const value = within(preview).getByText("-1.23%")

    // Then it uses the negative text colour, not the chart mark colour
    expect(value).toHaveStyle({ color: darkTheme.color.dataNegative })
  })

  it("opens the column the grid header asked for, adding it", () => {
    // Given / When
    renderComponent(<Editor focusColumn="change" />)

    // Then
    const list = screen.getByRole("list", { name: "Column formats" })
    expect(within(list).getByText("change")).toBeVisible()
    expect(
      screen.getByRole("button", { name: /^change: show as/ }),
    ).toBeVisible()
    expect(latest).toEqual({ change: {} })
  })

  it("removes a column's format", () => {
    // Given
    renderComponent(<Editor initial={{ price: { decimals: 2 } }} />)

    // When
    fireEvent.click(
      screen.getByRole("button", { name: "Remove the format of price" }),
    )

    // Then
    expect(latest).toBeUndefined()
  })

  it("offers numeric and array columns, and only a sparkline for arrays", async () => {
    // Given
    renderComponent(<Editor />)

    // When the user opens the column list
    await userEvent.click(
      screen.getByRole("button", { name: /^Format a column/ }),
    )

    // Then timestamps and text are not offered
    const offered = screen
      .getAllByRole("menuitemradio")
      .map((item) => item.textContent)
    expect(offered).toEqual(["price", "change", "trend"])

    // When the user picks the array column
    await userEvent.click(screen.getByRole("menuitemradio", { name: "trend" }))
    await userEvent.click(
      screen.getByRole("button", { name: /^trend: in the grid cell/ }),
    )
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /^Sparkline/ }),
    )

    // Then the array draws as a sparkline, with no number settings
    expect(screen.queryByRole("button", { name: /^trend: show as/ })).toBeNull()
    expect(latest).toEqual({ trend: { visual: "sparkline" } })
  })
})
