// @vitest-environment jsdom
import React, { useState } from "react"
import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { findHook, queryHook, renderComponent } from "../../../test/component"
import type { Buffer } from "../../../store/buffers"
import { MetricType } from "./utils"
import { Metrics } from "./index"

type EditorValue = {
  activeBuffer: Buffer
  buffers: Buffer[]
  updateBuffer: (id: number, patch: Partial<Buffer>) => Promise<void>
  isNavigatingFromSearchRef: { current: boolean }
}

const mocks = vi.hoisted(() => ({
  editor: undefined as unknown as EditorValue,
  scrolls: [] as { element: Element; options: unknown }[],
}))

vi.mock("../../../providers", async () => {
  const { createContext } =
    await vi.importActual<typeof import("react")>("react")
  return {
    useEditor: () => mocks.editor,
    QuestContext: createContext({ quest: { query: vi.fn() } }),
  }
})
vi.mock("react-redux", async () => {
  const { selectors } =
    await vi.importActual<typeof import("../../../store")>("../../../store")
  return {
    useSelector: (selector: unknown) =>
      selector === selectors.telemetry.getConfig ? { enabled: true } : [],
  }
})
vi.mock("../../../modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))
vi.mock("../../../hooks/useElementVisibility", () => ({
  default: () => [{ current: null }, true],
}))
vi.mock("uplot-react", () => ({ default: () => null }))
vi.mock("../Notebook/NotebookViewToggle", () => ({
  NotebookLayoutToggle: () => null,
}))

const METRICS_BUFFER_ID = 1

const metricsBuffer = (metricTypes: MetricType[]): Buffer =>
  ({
    id: METRICS_BUFFER_ID,
    label: "Metrics 1",
    value: "",
    position: 0,
    metricsViewState: {
      metrics: metricTypes.map((metricType, position) => ({
        metricType,
        position,
        color: "metricBlue",
      })),
    },
  }) as unknown as Buffer

const MetricsTab = ({ initialBuffer }: { initialBuffer: Buffer }) => {
  const [buffer, setBuffer] = useState(initialBuffer)
  mocks.editor = {
    activeBuffer: buffer,
    buffers: [buffer],
    updateBuffer: (_id, patch) => {
      setBuffer((current) => ({ ...current, ...patch }))
      return Promise.resolve()
    },
    isNavigatingFromSearchRef: { current: false },
  }
  return <Metrics />
}

describe("Metrics", () => {
  beforeEach(() => {
    mocks.scrolls = []
    Element.prototype.scrollIntoView = function (
      this: Element,
      options?: boolean | ScrollIntoViewOptions,
    ) {
      mocks.scrolls.push({ element: this, options })
    }
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
  })

  it("leaves existing widgets in place with their table selectors closed", () => {
    // Given a metrics tab with a widget that has no table yet
    renderComponent(
      <MetricsTab
        initialBuffer={metricsBuffer([MetricType.WAL_TRANSACTION_THROUGHPUT])}
      />,
    )

    // Then the widget is shown without scrolling or opening its selector
    expect(screen.getByText("Transaction Throughput (txn/s)")).toBeVisible()
    expect(mocks.scrolls).toHaveLength(0)
    expect(queryHook("table-selector-dropdown")).toBeNull()
  })

  it("scrolls a newly added widget into view and opens its table selector", async () => {
    // Given a metrics tab with one widget
    renderComponent(
      <MetricsTab
        initialBuffer={metricsBuffer([MetricType.WAL_TRANSACTION_THROUGHPUT])}
      />,
    )

    // When the user adds a Write Amplification widget
    fireEvent.click(screen.getByRole("button", { name: "Add widget" }))
    await act(async () => {
      fireEvent.click(await screen.findByText("Table Write Amplification"))
    })

    // Then only the new widget scrolls to the center of the view
    expect(mocks.scrolls).toHaveLength(1)
    const [{ element: scrolledWidget, options }] = mocks.scrolls
    expect(scrolledWidget).toHaveTextContent("Write Amplification")
    expect(scrolledWidget).not.toHaveTextContent("Transaction Throughput")
    expect(options).toEqual({ block: "center" })

    // And its table selector is open, ready for typing
    expect(await findHook("table-selector-dropdown")).toBeVisible()
    const input = scrolledWidget.querySelector(
      "[data-hook='table-selector-input']",
    )
    await waitFor(() => expect(document.activeElement).toBe(input))
  })
})
