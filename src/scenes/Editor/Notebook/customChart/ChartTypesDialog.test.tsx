// @vitest-environment jsdom
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderComponent } from "../../../../test/component"
import type {
  NotebookCell,
  NotebookChartType,
} from "../../../../store/notebook"
import { ChartTypesDialog } from "./ChartTypesDialog"
import { Button } from "../../../../components/Button"

vi.mock("@monaco-editor/react", () => ({
  loader: { init: () => new Promise(() => undefined), config: () => undefined },
  Editor: ({
    value,
    onChange,
    options,
  }: {
    value: string
    onChange: (v: string) => void
    options: { ariaLabel: string }
  }) => (
    <div className="monaco-editor">
      <textarea
        aria-label={options.ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}))

const glyph = { name: "glyph", renderItem: "return null", description: "Dots" }

const cells = [
  {
    id: "c1",
    name: "Battery",
    value: "SELECT 1",
    position: 0,
    chartConfig: {
      xColumn: null,
      queries: [],
      custom: { option: { series: [{ type: "custom", renderItem: "glyph" }] } },
    },
  },
] as unknown as NotebookCell[]

const renderDialog = () => {
  const onSave = vi.fn()
  const onOpenChange = vi.fn()
  const view = (types: NotebookChartType[]) => (
    <ChartTypesDialog
      open
      onOpenChange={onOpenChange}
      types={types}
      cells={cells}
      onSave={onSave}
    />
  )
  const { rerender } = renderComponent(view([glyph]))
  return {
    onSave,
    onOpenChange,
    dialog: screen.getByRole("dialog"),
    // The saved types change, as when an agent edits them.
    changeTypes: (types: NotebookChartType[]) => rerender(view(types)),
  }
}

describe("ChartTypesDialog", () => {
  it("restores focus to its toolbar trigger on Cancel", async () => {
    const Fixture = () => {
      const [open, setOpen] = React.useState(false)
      const triggerRef = React.useRef<HTMLButtonElement>(null)
      return (
        <>
          <Button
            onClick={(event) => {
              if (event.currentTarget instanceof HTMLButtonElement)
                triggerRef.current = event.currentTarget
              setOpen(true)
            }}
          >
            Chart types
          </Button>
          <ChartTypesDialog
            open={open}
            onOpenChange={setOpen}
            triggerRef={triggerRef}
            types={[]}
            cells={[]}
            onSave={() => {}}
          />
        </>
      )
    }
    renderComponent(<Fixture />)
    const trigger = screen.getByRole("button", { name: "Chart types" })
    trigger.focus()
    await userEvent.keyboard("{Enter}")
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    )
    await waitFor(() => expect(trigger).toHaveFocus())
  })
  it("lists the types with the cells that use them", () => {
    // Given / When
    const { dialog } = renderDialog()

    // Then
    expect(within(dialog).getByText("Used by 1 cell")).toBeVisible()
    expect(within(dialog).getByText("Used by Battery.")).toBeVisible()
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("renames a type and its uses in one save", async () => {
    // Given
    const { dialog, onSave } = renderDialog()
    const name = within(dialog).getByDisplayValue("glyph")

    // When
    await userEvent.clear(name)
    await userEvent.type(name, "dots")

    // Then the dialog says the cell follows, and saving carries the rename
    expect(
      within(dialog).getByText(/Saving renames it in Battery/),
    ).toBeVisible()
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    expect(onSave).toHaveBeenCalledWith(
      [
        {
          name: "dots",
          renderItem: "return null",
          description: "Dots",
          allowed: false,
        },
      ],
      { glyph: "dots" },
    )
  })

  it("blocks saving a type that does not compile", async () => {
    // Given
    const { dialog, onSave } = renderDialog()

    // When
    await userEvent.click(
      within(dialog).getByRole("button", { name: /New chart type/ }),
    )
    const source = within(dialog).getByRole("textbox", {
      name: "Source of chart type chartType1",
    })
    await userEvent.clear(source)
    await userEvent.type(source, "return (")

    // Then
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      /Does not compile/,
    )
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it("asks before deleting a type cells use, and before discarding edits", async () => {
    // Given
    const { dialog, onSave, onOpenChange } = renderDialog()

    // When the user deletes the used type
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    )

    // Then the cells that draw with it are named
    const confirm = await screen.findByRole("alertdialog")
    expect(confirm).toHaveTextContent(/Battery draws with it/)
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Delete" }),
    )
    expect(within(dialog).getByText(/No chart types yet/)).toBeVisible()

    // When the user cancels with the deletion unsaved
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    )

    // Then the dialog asks first
    const discard = await screen.findByRole("alertdialog")
    expect(discard).toHaveTextContent(/not saved/)
    await userEvent.click(
      within(discard).getByRole("button", { name: "Discard" }),
    )
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(onSave).not.toHaveBeenCalled()
  })

  it("follows changes made elsewhere: at once when clean, on request when edited", async () => {
    // Given an open dialog with nothing edited
    const { dialog, changeTypes } = renderDialog()

    // When an agent changes the description
    changeTypes([{ ...glyph, description: "Round dots" }])

    // Then the dialog shows it
    expect(within(dialog).getByDisplayValue("Round dots")).toBeVisible()

    // When the user edits, then the agent changes the types again
    await userEvent.type(within(dialog).getByDisplayValue("glyph"), "2")
    changeTypes([{ ...glyph, description: "Squares" }])

    // Then the edit stays, but cannot overwrite the new version
    expect(within(dialog).getByDisplayValue("glyph2")).toBeVisible()
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled()
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Load the new version" }),
    )
    expect(within(dialog).getByDisplayValue("glyph")).toBeVisible()
    expect(within(dialog).getByDisplayValue("Squares")).toBeVisible()
  })

  it("keeps code it did not come from the user off until allowed", async () => {
    // Given an imported type, which is not allowed to run
    const { dialog, onSave } = renderDialog()
    expect(within(dialog).getByText("Not allowed to run")).toBeVisible()
    const allow = within(dialog).getByRole("checkbox", {
      name: "Allow this code to run",
    })
    expect(allow).not.toBeChecked()

    // When the user allows it and saves
    await userEvent.click(allow)
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))

    // Then it is saved as allowed
    expect(onSave).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "glyph", allowed: true })],
      {},
    )
  })
})
