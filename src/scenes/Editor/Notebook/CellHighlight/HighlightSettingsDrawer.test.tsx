// @vitest-environment jsdom
import { renderComponent } from "../../../../test/component"
import React, { useState } from "react"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { questClient } from "../../../../utils/questdb/queryClient"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Button } from "../../../../components/Button"
import type { HighlightConfig } from "../../../../components/ResultGrid/highlight"
import {
  HighlightSettingsDrawer,
  highlightToSave,
  type GridSettingsSave,
} from "./HighlightSettingsDrawer"
import {
  CellOverlayProvider,
  CellOverlaySlot,
} from "../settingsDrawer/CellOverlayContext"

const configuration: HighlightConfig = {
  identityColumns: ["k"],
  rules: [
    {
      id: "change",
      kind: "previous",
      enabled: true,
      target: { kind: "column", name: "v" },
      condition: { op: "changedBy", threshold: 0, unit: "percent" },
      appliesTo: "cell",
      display: "temporary",
      color: "dataSeries2",
    },
  ],
}
const Fixture = ({
  onSave,
  saved = configuration,
  focus,
  gridMode,
  columns = [
    { name: "k", type: "STRING" },
    { name: "v", type: "LONG" },
  ],
}: {
  onSave: (next: GridSettingsSave) => void
  saved?: HighlightConfig
  focus?: { section: string; column?: string }
  gridMode?: "stable" | "stream"
  columns?: { name: string; type: string }[]
}) => {
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Grid settings</Button>
      <CellOverlaySlot ref={setOverlay} />
      <CellOverlayProvider value={overlay}>
        <HighlightSettingsDrawer
          open={open}
          appearInPlace
          initialDraft={
            saved === configuration
              ? {
                  config: configuration,
                  expandedRuleId: "change",
                  formats: { v: { decimals: 1 } },
                }
              : null
          }
          onDraftChange={() => undefined}
          columns={columns}
          columnRange={() => null}
          config={saved}
          formats={{ v: { decimals: 1 } }}
          gridMode={gridMode}
          samples={{ v: 12 }}
          focus={focus}
          defaultIdentity={["k"]}
          variables={[{ name: "sym", value: "'BTC'" }]}
          duplicateCountOf={() => 0}
          onSave={onSave}
          onCancel={() => setOpen(false)}
        />
      </CellOverlayProvider>
    </>
  )
}

describe("highlight settings validation", () => {
  it("retains an explicit identity matching the active statement's default", () => {
    expect(highlightToSave(["k"], [], ["k"], true)).toEqual({
      identityColumns: ["k"],
      rules: [],
    })
    expect(highlightToSave(["k"], [], ["k"])).toBeNull()
  })

  it("keeps invalid thresholds editable and only submits a valid correction", async () => {
    // Given
    const onSave = vi.fn()
    renderComponent(<Fixture onSave={onSave} />)
    fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))
    const input = await screen.findByLabelText("Change threshold")
    // When / Then
    fireEvent.change(input, { target: { value: "-5" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(screen.getByText("Should be non-negative")).toBeVisible()
    expect(input).toHaveValue(-5)
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(screen.getByText("Should be a number")).toBeVisible()
    expect(input).toHaveValue(null)
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: "2" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith({
      highlight: {
        ...configuration,
        rules: [
          {
            ...configuration.rules[0],
            condition: { op: "changedBy", threshold: 2, unit: "percent" },
          },
        ],
      },
      formats: { v: { decimals: 1 } },
      newVariables: [],
    })
  })

  it("clears the rules without submitting the edited rules", async () => {
    // Given
    const onSave = vi.fn()
    renderComponent(<Fixture onSave={onSave} />)
    fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))
    const input = await screen.findByLabelText("Change threshold")
    fireEvent.change(input, { target: { value: "99" } })
    // When
    fireEvent.click(screen.getByRole("button", { name: "Clear rules" }))
    // Then
    expect(onSave).toHaveBeenCalledOnce()
    expect(onSave).toHaveBeenCalledWith({
      highlight: null,
      formats: { v: { decimals: 1 } },
      newVariables: [],
    })
  })

  it("keeps a chosen identity when the rules are cleared", async () => {
    // Given rules matched by a non-default identity
    const onSave = vi.fn()
    renderComponent(
      <Fixture
        saved={{ ...configuration, identityColumns: ["v"] }}
        onSave={onSave}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))

    // When
    fireEvent.click(await screen.findByRole("button", { name: "Clear rules" }))

    // Then
    expect(onSave).toHaveBeenCalledWith({
      highlight: { identityColumns: ["v"], rules: [] },
      formats: { v: { decimals: 1 } },
      newVariables: [],
    })
  })

  it("opens on the column a header asked for and saves no highlight settings for a formats-only change", async () => {
    // Given a grid without highlight settings
    const onSave = vi.fn()
    renderComponent(
      <Fixture
        saved={{ identityColumns: ["k"], rules: [] }}
        focus={{ section: "formats", column: "v" }}
        onSave={onSave}
      />,
    )

    // When the drawer opens from the header and the user saves
    fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))
    expect(
      await screen.findByRole("button", { name: /^v: show as/ }),
    ).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    // Then only the formats are saved
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith({
      highlight: null,
      formats: { v: { decimals: 1 } },
      newVariables: [],
    })
  })

  it("saves the live update mode the user picks, and warns while no columns match rows", async () => {
    // Given a grid with no identity columns
    const onSave = vi.fn()
    renderComponent(
      <Fixture saved={{ identityColumns: [], rules: [] }} onSave={onSave} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))

    // When the user keeps rows in place
    await userEvent.click(
      await screen.findByRole("button", { name: /^Live updates:/ }),
    )
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /^Keep rows in place/ }),
    )

    // Then it explains the mode, warns about the missing columns and saves it
    expect(screen.getByText(/A row stays where it was/)).toBeVisible()
    expect(screen.getByRole("status")).toHaveTextContent(
      /Choose the columns that match rows/,
    )
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave.mock.calls[0]).toEqual([
      {
        highlight: { identityColumns: [], rules: [] },
        formats: { v: { decimals: 1 } },
        gridMode: "stable",
        interactions: undefined,
        newVariables: [],
      },
    ])
  })

  it("turns a live mode off", async () => {
    // Given a grid that keeps rows in place
    const onSave = vi.fn()
    renderComponent(
      <Fixture
        saved={{ identityColumns: ["k"], rules: [] }}
        gridMode="stable"
        onSave={onSave}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))

    // When the user goes back to the query's order
    await userEvent.click(
      await screen.findByRole("button", { name: /^Live updates:/ }),
    )
    await userEvent.click(
      screen.getByRole("menuitemradio", {
        name: /^Rows as the query returns them/,
      }),
    )
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    // Then the mode is saved as unset, so the cell drops it
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    const saved = (onSave.mock.calls[0] as [GridSettingsSave])[0]
    expect("gridMode" in saved).toBe(true)
    expect(saved.gridMode).toBeUndefined()
  })

  it("requires another Save when a new variable is edited during validation", async () => {
    // Given a drawer with a new variable and a database that answers late
    const onSave = vi.fn()
    type Answer = Awaited<ReturnType<typeof questClient.validateQuery>>
    let answer: (value: Answer) => void = () => undefined
    const validate = vi
      .spyOn(questClient, "validateQuery")
      .mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve
        }),
      )
      .mockResolvedValueOnce({} as Answer)
    try {
      renderComponent(<Fixture onSave={onSave} />)
      fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))
      await userEvent.click(
        await screen.findByRole("tab", { name: "Interactions" }),
      )
      fireEvent.click(screen.getByRole("checkbox", { name: /A click sets/ }))
      await userEvent.click(screen.getByRole("button", { name: /^Variable/ }))
      await userEvent.click(
        screen.getByRole("menuitemradio", { name: "New variable…" }),
      )
      fireEvent.change(screen.getByPlaceholderText("e.g. symbol"), {
        target: { value: "station" },
      })
      const value = screen.getByPlaceholderText("e.g. 'BTC'")
      fireEvent.change(value, { target: { value: "'east'" } })
      const save = screen.getByRole("button", { name: "Save" })

      // When the user edits the starting value before the check answers
      fireEvent.click(save)
      fireEvent.change(value, { target: { value: "'west'" } })
      await act(() => {
        answer({} as Answer)
        return Promise.resolve()
      })

      // Then the old validation result cannot save that edit
      expect(onSave).not.toHaveBeenCalled()
      fireEvent.click(save)
      await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
      expect(validate).toHaveBeenLastCalledWith(
        expect.stringContaining("'west'"),
      )
      const saved = (onSave.mock.calls[0] as [GridSettingsSave])[0]
      expect(saved.newVariables).toEqual([{ name: "station", value: "'west'" }])
    } finally {
      validate.mockRestore()
    }
  })

  it("saves a click on the grid, and Clear rules waits for an unfinished one", async () => {
    // Given
    const onSave = vi.fn()
    renderComponent(<Fixture onSave={onSave} />)
    fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))

    // When the user turns clicks on without a variable and clears the rules
    await userEvent.click(
      await screen.findByRole("tab", { name: "Interactions" }),
    )
    fireEvent.click(screen.getByRole("checkbox", { name: /A click sets/ }))
    await userEvent.click(screen.getByRole("tab", { name: "Highlights" }))
    fireEvent.click(screen.getByRole("button", { name: "Clear rules" }))

    // Then nothing is saved and Interactions shows what is missing
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a variable.")
    // And focus, which was on the removed Clear rules button, is on that tab
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Interactions" })).toHaveFocus(),
    )

    // When the user picks the variable and the column, then saves
    await userEvent.click(screen.getByRole("button", { name: /^Variable/ }))
    await userEvent.click(screen.getByRole("menuitemradio", { name: /^@sym/ }))
    await userEvent.click(screen.getByRole("button", { name: /^Set it to/ }))
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "The k of the clicked row" }),
    )
    expect(screen.getByText(/stays highlighted/)).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    // Then the click is saved with the rest
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        interactions: { click: { variable: "sym", column: "k" } },
        newVariables: [],
      }),
    )
  })

  it("moves focus to Format a column after the last format is removed by keyboard", async () => {
    // Given the Formats section with one formatted column
    renderComponent(<Fixture onSave={vi.fn()} focus={{ section: "formats" }} />)
    fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))
    const drawer = await screen.findByRole("dialog", { name: "Grid settings" })
    const remove = await screen.findByRole("button", {
      name: "Remove the format of v",
    })

    // When the keyboard user removes it
    remove.focus()
    await userEvent.keyboard("{Enter}")

    // Then focus stays in the drawer, on the control that adds a format
    await waitFor(() =>
      expect(document.activeElement).toHaveAccessibleName(
        expect.stringContaining("Format a column"),
      ),
    )
    expect(drawer).toContainElement(document.activeElement as HTMLElement)
  })

  it("hands focus back to an opener that shows only while focused", async () => {
    // Given an opener that is hidden once focus leaves it, like a column
    // header's Format button
    vi.stubGlobal("matchMedia", () => ({ matches: false }))
    renderComponent(<Fixture onSave={vi.fn()} />)
    const opener = screen.getByRole("button", { name: "Grid settings" })
    await userEvent.click(opener)
    await screen.findByRole("dialog", { name: "Grid settings" })
    opener.style.visibility = "hidden"
    const shownWhenFocused: string[] = []
    const focus = opener.focus.bind(opener)
    vi.spyOn(opener, "focus").mockImplementation((options) => {
      shownWhenFocused.push(getComputedStyle(opener).visibility)
      focus(options)
    })

    // When the drawer is cancelled and has slid out
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    const panel = screen.queryByRole("dialog", { name: "Grid settings" })
    if (panel) fireEvent.animationEnd(panel)
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Grid settings" }),
      ).not.toBeInTheDocument(),
    )

    // Then the opener was shown while it took focus back
    expect(shownWhenFocused).toEqual(["visible"])
    expect(opener).toHaveFocus()
    vi.unstubAllGlobals()
  })

  it("keeps focus in the drawer when the last format removed cannot be added back", async () => {
    // Given a format left on a column that no longer holds numbers
    renderComponent(
      <Fixture
        onSave={vi.fn()}
        saved={{ identityColumns: ["k"], rules: [] }}
        focus={{ section: "formats" }}
        columns={[{ name: "k", type: "STRING" }]}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))
    const drawer = await screen.findByRole("dialog", { name: "Grid settings" })
    const remove = await screen.findByRole("button", {
      name: "Remove the format of v",
    })

    // When the keyboard user removes it
    remove.focus()
    await userEvent.keyboard("{Enter}")

    // Then focus stays in the drawer, on its title
    await waitFor(() =>
      expect(drawer).toContainElement(document.activeElement as HTMLElement),
    )
    expect(document.activeElement?.tagName).toBe("H3")
  })

  it("moves focus to the next threshold after one is removed by keyboard", async () => {
    // Given a format coloured by three thresholds
    renderComponent(
      <Fixture onSave={vi.fn()} focus={{ section: "formats", column: "v" }} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Grid settings" }))
    const drawer = await screen.findByRole("dialog", { name: "Grid settings" })
    await userEvent.click(screen.getByRole("button", { name: /^v: colour/ }))
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /thresholds/i }),
    )
    for (let i = 0; i < 2; i++)
      await userEvent.click(
        within(drawer).getByRole("button", { name: /Add threshold/ }),
      )
    expect(
      screen.getAllByRole("button", { name: /^Remove threshold/ }),
    ).toHaveLength(3)

    // When the keyboard user removes the second one
    screen.getByRole("button", { name: "Remove threshold 2" }).focus()
    await userEvent.keyboard("{Enter}")

    // Then focus is on the threshold that took its place
    await waitFor(() =>
      expect(screen.getByLabelText("v: threshold 2")).toHaveFocus(),
    )
  })
})
