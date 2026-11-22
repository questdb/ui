// @vitest-environment jsdom
import { renderComponent } from "../../../../test/component"
import React, { useState } from "react"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { Button } from "../../../../components/Button"
import { Dialog } from "../../../../components/Dialog"
import { DrawSettingsDrawer } from "./DrawSettingsDrawer"
import { questClient } from "../../../../utils/questdb/queryClient"
import type { DrawSettings } from "./drawSettings"
import type { ChartConfig } from "./chartTypes"
import type { QueryTab } from "../DrawCanvas/drawCanvasUtils"
import type { StatementRows } from "../visuals/statementRows"
import {
  CellOverlayProvider,
  CellOverlaySlot,
} from "../settingsDrawer/CellOverlayContext"

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

// The custom option editor loads with the chart code; load it up front so
// the tests that open it do not wait on ECharts inside a findBy timeout.
beforeAll(async () => {
  await import("./CustomOptionSettings")
})

const columns = [
  { name: "ts", type: "TIMESTAMP" },
  { name: "symbol", type: "SYMBOL" },
  { name: "price", type: "DOUBLE" },
]

const effective: ChartConfig = {
  xColumn: "ts",
  queries: [{ type: "line", yColumns: ["price"] }],
}

const tabs: QueryTab[] = [
  {
    index: 0,
    label: "Q1",
    query: "SELECT ts, symbol, price FROM trades",
    columns,
    xColumn: "ts",
    compatible: true,
    inferredChart: { type: "line", yColumns: ["price"] },
  },
]

const statements: StatementRows[] = [
  { columns, rows: [["2026-01-01T00:00:00.000000Z", "BTC", 1]] },
]

const Fixture = ({
  saved,
  onSave,
  statementsOverride,
  tabsOverride,
  effectiveOverride,
  children,
}: {
  saved: DrawSettings
  onSave: (next: DrawSettings) => void
  statementsOverride?: StatementRows[]
  tabsOverride?: QueryTab[]
  effectiveOverride?: ChartConfig
  children?: React.ReactNode
}) => {
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open settings</Button>
      {children}
      <CellOverlaySlot ref={setOverlay} />
      <CellOverlayProvider value={overlay}>
        <DrawSettingsDrawer
          open={open}
          onClose={() => setOpen(false)}
          initialDraft={null}
          onDraftChange={() => undefined}
          appearInPlace
          tabs={tabsOverride ?? tabs}
          saved={saved}
          effective={
            effectiveOverride ??
            (tabsOverride
              ? {
                  ...effective,
                  queries: [
                    ...effective.queries,
                    { type: "line", yColumns: ["price"] },
                  ],
                }
              : effective)
          }
          statements={statementsOverride ?? statements}
          onSave={onSave}
        />
      </CellOverlayProvider>
    </>
  )
}

const openDrawer = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
  return screen.findByRole("dialog", { name: "Chart settings" })
}

describe("draw settings drawer", () => {
  it.each(["bullet", "planTree"] as const)(
    "does not offer or save interactions for %s",
    async (type) => {
      const onSave = vi.fn<[DrawSettings], void>()
      renderComponent(
        <Fixture
          onSave={onSave}
          saved={{
            chartConfig: { ...effective, visual: { type } },
            interactions: { click: { variable: "target" } },
          }}
        />,
      )
      const drawer = await openDrawer()
      await userEvent.click(
        within(drawer).getByRole("tab", { name: "Interactions" }),
      )
      expect(
        within(drawer).getByText(/does not support click or drag/),
      ).toBeVisible()
      await userEvent.click(
        within(drawer).getByRole("button", { name: "Save" }),
      )
      expect(onSave.mock.calls[0]?.[0].interactions).toBeUndefined()
    },
  )

  beforeEach(() => {
    // The kind switch is a segmented control, which reads the motion
    // preference and draws its lens on a canvas.
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }))
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
  })

  it("keeps a dirty drawer open when Escape closes the foreground dialog", async () => {
    renderComponent(
      <Fixture saved={{ chartConfig: effective }} onSave={vi.fn()}>
        <Dialog.Root>
          <Dialog.Trigger>Open chart types</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Content>
              <Dialog.Title>Chart types</Dialog.Title>
              <Dialog.Description>
                Manage reusable chart types
              </Dialog.Description>
              <Button>Manage</Button>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </Fixture>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Open settings" }))
    const drawer = await screen.findByRole("dialog", { name: "Chart settings" })
    await userEvent.click(
      within(drawer).getByRole("button", { name: "Component" }),
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Open chart types" }),
    )
    const foreground = await screen.findByRole("dialog", {
      name: "Chart types",
    })
    await waitFor(() =>
      expect(
        within(foreground).getByRole("button", { name: "Manage" }),
      ).toHaveFocus(),
    )
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(foreground).not.toBeInTheDocument())
    expect(drawer).toBeVisible()
    expect(
      within(drawer).getByRole("button", { name: "Component" }),
    ).toHaveAttribute("aria-pressed", "true")
  })

  it("keeps a component when the drawer saves without changes", async () => {
    // Given a cell drawn as a gauge
    const onSave = vi.fn()
    renderComponent(
      <Fixture
        saved={{ chartConfig: { ...effective, visual: { type: "gauge" } } }}
        onSave={onSave}
      />,
    )
    const drawer = await openDrawer()

    // When
    expect(
      within(drawer).getByRole("button", { name: "Component" }),
    ).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(within(drawer).getByRole("button", { name: "Save" }))

    // Then
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith(
      {
        chartConfig: { ...effective, visual: { type: "gauge" } },
      },
      [],
    )
  })

  it("draws a preset as a component", async () => {
    // Given a preset line chart
    const onSave = vi.fn()
    renderComponent(
      <Fixture saved={{ chartConfig: effective }} onSave={onSave} />,
    )
    const drawer = await openDrawer()

    // When the user switches to a component and picks the value column
    fireEvent.click(within(drawer).getByRole("button", { name: "Component" }))
    expect(within(drawer).getByText(/One tile per row/)).toBeVisible()
    fireEvent.click(within(drawer).getByRole("button", { name: "Save" }))

    // Then stat tiles are saved, the preset kept underneath
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith(
      {
        chartConfig: { ...effective, visual: { type: "stat" } },
      },
      [],
    )
  })

  it("starts a custom option from the chart and refuses to save broken JSON", async () => {
    // Given
    const onSave = vi.fn()
    renderComponent(
      <Fixture saved={{ chartConfig: effective }} onSave={onSave} />,
    )
    const drawer = await openDrawer()

    // When the user switches to a custom option
    fireEvent.click(within(drawer).getByRole("button", { name: "Custom" }))
    const editor = await within(drawer).findByLabelText("ECharts option")

    // Then it starts from the current chart
    expect((editor as HTMLTextAreaElement).value).toContain('"datasetId": "q0"')

    // When the JSON is broken
    fireEvent.change(editor, { target: { value: "{ broken" } })
    fireEvent.click(within(drawer).getByRole("button", { name: "Save" }))

    // Then nothing is saved and the error shows
    expect(onSave).not.toHaveBeenCalled()
    expect(within(drawer).getByRole("alert")).toBeVisible()

    // When it is fixed
    fireEvent.change(editor, { target: { value: '{"series": []}' } })
    fireEvent.click(within(drawer).getByRole("button", { name: "Save" }))

    // Then the option is saved
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith(
      {
        chartConfig: { ...effective, custom: { option: { series: [] } } },
      },
      [],
    )
  })

  it("lists what the sanitizer will change in a custom option", async () => {
    // Given a custom option with a literal colour
    renderComponent(
      <Fixture
        saved={{
          chartConfig: {
            ...effective,
            custom: {
              option: {
                series: [{ type: "line", itemStyle: { color: "#ff0000" } }],
              },
            },
          },
        }}
        onSave={vi.fn()}
      />,
    )

    // When
    const drawer = await openDrawer()

    // Then
    expect(
      within(drawer).getByRole("list", { name: "Problems with the option" }),
    ).toHaveTextContent(/Colours come from the theme/)
  })

  const savedOf = (onSave: { mock: { calls: unknown[][] } }) =>
    (onSave.mock.calls[0] as [DrawSettings])[0]

  it("saves the columns and state meanings the user picks for a component", async () => {
    // Given an uptime component over rows of time, lane and state
    const onSave = vi.fn()
    const uptimeColumns = [
      { name: "ts", type: "TIMESTAMP" },
      { name: "robot", type: "SYMBOL" },
      { name: "mode", type: "SYMBOL" },
    ]
    renderComponent(
      <Fixture
        saved={{ chartConfig: { ...effective, visual: { type: "uptime" } } }}
        statementsOverride={[
          {
            columns: uptimeColumns,
            rows: [
              ["2026-01-01T00:00:00.000000Z", "R-1", "moving"],
              ["2026-01-01T01:00:00.000000Z", "R-1", "stuck"],
            ],
          },
        ]}
        onSave={onSave}
      />,
    )
    const drawer = await openDrawer()

    // When the user picks the state column and marks "stuck" as bad
    await userEvent.click(
      within(drawer).getByRole("button", { name: /^State:/ }),
    )
    await userEvent.click(screen.getByRole("menuitemradio", { name: "mode" }))
    await userEvent.click(
      within(drawer).getByRole("button", { name: /^Meaning of stuck:/ }),
    )
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Bad" }))
    fireEvent.click(within(drawer).getByRole("button", { name: "Save" }))

    // Then
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(savedOf(onSave).chartConfig.visual).toEqual({
      type: "uptime",
      columns: { state: "mode" },
      severity: { stuck: "bad" },
    })
  })

  it("offers events for a later statement with a timestamp", async () => {
    // Given a chart over two statements
    const onSave = vi.fn()
    const twoTabs: QueryTab[] = [
      ...tabs,
      {
        ...tabs[0],
        index: 1,
        label: "Q2",
        query: "SELECT ts, note FROM deploys",
      },
    ]
    renderComponent(
      <Fixture
        saved={{ chartConfig: effective }}
        tabsOverride={twoTabs}
        onSave={onSave}
      />,
    )
    const drawer = await openDrawer()

    // When the user makes the second statement mark events
    await userEvent.click(within(drawer).getByRole("tab", { name: "Q2" }))
    await userEvent.click(
      within(drawer).getByRole("button", { name: /^Chart type:/ }),
    )
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /Events \(markers/ }),
    )

    // Then its column pickers show, and the type is saved
    expect(
      within(drawer).getByRole("button", { name: /^Events time column:/ }),
    ).toBeVisible()
    fireEvent.click(within(drawer).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(savedOf(onSave).chartConfig.queries[1]).toMatchObject({
      type: "events",
    })
  })

  it("lets keyboard users leave the JSON editor and move on", async () => {
    // Given the custom option editor has focus
    renderComponent(
      <Fixture
        saved={{ chartConfig: { ...effective, custom: { option: {} } } }}
        onSave={vi.fn()}
      />,
    )
    const drawer = await openDrawer()
    const editor = await within(drawer).findByLabelText("ECharts option")
    editor.focus()

    // When the user presses Escape
    fireEvent.keyDown(editor, { key: "Escape" })

    // Then the drawer stays open and focus leaves the editor for its frame
    expect(drawer).toBeInTheDocument()
    expect(document.activeElement).toBe(
      drawer.querySelector("[data-hook='code-editor-field']"),
    )

    // When the user presses Tab
    fireEvent.keyDown(document.activeElement as Element, { key: "Tab" })

    // Then focus moves past the editor instead of back into it
    expect(document.activeElement).toBe(
      within(drawer).getByRole("button", { name: "Cancel" }),
    )
  })

  it("saves column formats with the chart", async () => {
    // Given a preset chart
    const onSave = vi.fn()
    renderComponent(
      <Fixture saved={{ chartConfig: effective }} onSave={onSave} />,
    )
    const drawer = await openDrawer()

    // When the user gives price two decimals in the Formats section
    await userEvent.click(within(drawer).getByRole("tab", { name: "Formats" }))
    await userEvent.click(
      within(drawer).getByRole("button", { name: /^Format a column/ }),
    )
    await userEvent.click(screen.getByRole("menuitemradio", { name: "price" }))
    fireEvent.change(within(drawer).getByPlaceholderText("Auto"), {
      target: { value: "2" },
    })
    fireEvent.click(within(drawer).getByRole("button", { name: "Save" }))

    // Then the chart and its formats are saved together
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith(
      {
        chartConfig: effective,
        formats: { price: { decimals: 2 } },
      },
      [],
    )
  })

  it("saves a click into a new variable, and sends the user back to fix an unfinished one", async () => {
    // Given a preset chart
    const onSave = vi.fn()
    renderComponent(
      <Fixture saved={{ chartConfig: effective }} onSave={onSave} />,
    )
    const drawer = await openDrawer()

    // When the user turns clicks on without a variable and saves from Chart
    await userEvent.click(
      within(drawer).getByRole("tab", { name: "Interactions" }),
    )
    fireEvent.click(
      within(drawer).getByRole("checkbox", { name: /A click sets/ }),
    )
    await userEvent.click(within(drawer).getByRole("tab", { name: "Chart" }))
    fireEvent.click(within(drawer).getByRole("button", { name: "Save" }))

    // Then nothing is saved and Interactions shows what is missing
    expect(onSave).not.toHaveBeenCalled()
    expect(within(drawer).getByRole("alert")).toHaveTextContent(
      "Choose a variable.",
    )

    // When the user creates the variable, which the database accepts
    const validate = vi
      .spyOn(questClient, "validateQuery")
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof questClient.validateQuery>>,
      )
    await userEvent.click(
      within(drawer).getByRole("button", { name: /^Variable/ }),
    )
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "New variable…" }),
    )
    fireEvent.change(within(drawer).getByPlaceholderText("e.g. symbol"), {
      target: { value: "symbol" },
    })
    fireEvent.change(within(drawer).getByPlaceholderText("e.g. 'BTC'"), {
      target: { value: "'BTC'" },
    })
    expect(within(drawer).queryByRole("alert")).toBeNull()
    fireEvent.click(within(drawer).getByRole("button", { name: "Save" }))

    // Then the variable is checked, and the click and the variable are saved
    // together
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(validate).toHaveBeenCalledWith(
      expect.stringContaining("@symbol := 'BTC'"),
    )
    expect(onSave).toHaveBeenCalledWith(
      {
        chartConfig: effective,
        interactions: { click: { variable: "symbol" } },
      },
      [{ name: "symbol", value: "'BTC'" }],
    )
  })

  it("does not save when the user cancels while the database checks a new variable", async () => {
    // Given a click into a new variable, and a database that answers late
    const onSave = vi.fn()
    type Answer = Awaited<ReturnType<typeof questClient.validateQuery>>
    let answer: (value: Answer) => void = () => undefined
    vi.spyOn(questClient, "validateQuery").mockReturnValue(
      new Promise((resolve) => {
        answer = resolve
      }),
    )
    renderComponent(
      <Fixture saved={{ chartConfig: effective }} onSave={onSave} />,
    )
    const drawer = await openDrawer()
    await userEvent.click(
      within(drawer).getByRole("tab", { name: "Interactions" }),
    )
    fireEvent.click(
      within(drawer).getByRole("checkbox", { name: /A click sets/ }),
    )
    await userEvent.click(
      within(drawer).getByRole("button", { name: /^Variable/ }),
    )
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "New variable…" }),
    )
    fireEvent.change(within(drawer).getByPlaceholderText("e.g. symbol"), {
      target: { value: "symbol" },
    })
    fireEvent.change(within(drawer).getByPlaceholderText("e.g. 'BTC'"), {
      target: { value: "'BTC'" },
    })

    // When the user saves, then cancels before the database answers
    fireEvent.click(within(drawer).getByRole("button", { name: "Save" }))
    fireEvent.click(within(drawer).getByRole("button", { name: "Cancel" }))
    answer({} as Answer)
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Then nothing is saved
    expect(onSave).not.toHaveBeenCalled()
  })

  it("draws a statement as a band with the edges it guesses or the user picks", async () => {
    // Given a time series with percentile columns, drawn as lines split by
    // symbol
    const onSave = vi.fn()
    const bandColumns = [
      { name: "ts", type: "TIMESTAMP" },
      { name: "symbol", type: "SYMBOL" },
      { name: "price", type: "DOUBLE" },
      { name: "p05", type: "DOUBLE" },
      { name: "p95", type: "DOUBLE" },
      { name: "p99", type: "DOUBLE" },
    ]
    renderComponent(
      <Fixture
        saved={{ chartConfig: effective }}
        tabsOverride={[{ ...tabs[0], columns: bandColumns }]}
        effectiveOverride={{
          xColumn: "ts",
          queries: [
            {
              type: "line",
              yColumns: ["price", "p05", "p95", "p99"],
              partitionByColumn: "symbol",
            },
          ],
        }}
        onSave={onSave}
      />,
    )
    const drawer = await openDrawer()

    // When the user picks the band type
    await userEvent.click(
      within(drawer).getByRole("button", { name: /^Chart type:/ }),
    )
    await userEvent.click(screen.getByRole("menuitemradio", { name: /^Band/ }))

    // Then the edges are guessed from their names
    expect(
      within(drawer).getByRole("button", { name: /^Lower edge column: p05/ }),
    ).toBeVisible()
    expect(
      within(drawer).getByRole("button", { name: /^Upper edge column: p95/ }),
    ).toBeVisible()

    // When the user picks another upper edge
    await userEvent.click(
      within(drawer).getByRole("button", { name: /^Upper edge column:/ }),
    )
    await userEvent.click(screen.getByRole("menuitemradio", { name: "p99" }))
    fireEvent.click(within(drawer).getByRole("button", { name: "Save" }))

    // Then the band saves the picked edges, and they are not also lines
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    const saved = savedOf(onSave).chartConfig.queries[0]
    expect(saved).toMatchObject({
      type: "band",
      band: { lower: "p05", upper: "p99" },
    })
    expect(saved?.yColumns).toEqual(["price"])
    // A band reads its own columns, so the partition is gone
    expect(saved?.partitionByColumn).toBeUndefined()
  })

  it("saves 100% stacking, and says where thresholds come from", async () => {
    // Given a line chart without format thresholds
    const onSave = vi.fn()
    renderComponent(
      <Fixture saved={{ chartConfig: effective }} onSave={onSave} />,
    )
    const drawer = await openDrawer()

    // When the user makes it a 100% stacked area
    await userEvent.click(
      within(drawer).getByRole("button", { name: /^Chart type:/ }),
    )
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Area" }))
    await userEvent.click(
      within(drawer).getByRole("checkbox", { name: /Stack to 100%/ }),
    )

    // Then thresholds point to Formats, bars are not offered to lie down,
    // and the stacking saves
    expect(within(drawer).getByText(/add them under Formats/)).toBeVisible()
    expect(
      within(drawer).queryByRole("checkbox", { name: /Horizontal bars/ }),
    ).toBeNull()
    fireEvent.click(within(drawer).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(savedOf(onSave).chartConfig.queries[0]).toMatchObject({
      type: "area",
      percentStack: true,
    })
  })

  it("does not save horizontal once the chart is no longer bars", async () => {
    // Given a bar chart laid down
    const onSave = vi.fn()
    const bars: ChartConfig = {
      ...effective,
      horizontal: true,
      queries: [{ type: "bar", yColumns: ["price"] }],
    }
    renderComponent(
      <Fixture
        saved={{ chartConfig: bars }}
        effectiveOverride={bars}
        onSave={onSave}
      />,
    )
    const drawer = await openDrawer()
    expect(
      within(drawer).getByRole("checkbox", { name: /Horizontal bars/ }),
    ).toBeChecked()

    // When the user switches to a line
    await userEvent.click(
      within(drawer).getByRole("button", { name: /^Chart type:/ }),
    )
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Line" }))
    fireEvent.click(within(drawer).getByRole("button", { name: "Save" }))

    // Then
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(savedOf(onSave).chartConfig.horizontal).toBeUndefined()
  })

  it("offers horizontal bars when every series is a bar", async () => {
    // Given a bar chart
    const onSave = vi.fn()
    renderComponent(
      <Fixture
        saved={{
          chartConfig: {
            ...effective,
            queries: [{ type: "bar", yColumns: ["price"] }],
          },
        }}
        effectiveOverride={{
          ...effective,
          queries: [{ type: "bar", yColumns: ["price"] }],
        }}
        onSave={onSave}
      />,
    )
    const drawer = await openDrawer()

    // When
    await userEvent.click(
      within(drawer).getByRole("checkbox", { name: /Horizontal bars/ }),
    )
    fireEvent.click(within(drawer).getByRole("button", { name: "Save" }))

    // Then
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(savedOf(onSave).chartConfig.horizontal).toBe(true)
  })
})
