// @vitest-environment jsdom
import React from "react"
import { act, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../test/component"
import {
  WORKING_AFTER_MS,
  WorkingIndicator,
  useQuietFor,
} from "./WorkingIndicator"

const Harness = ({ activity, live }: { activity: string; live: boolean }) =>
  useQuietFor(activity, live, WORKING_AFTER_MS) ? <WorkingIndicator /> : null

describe("Working", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows once a live answer has been silent for a moment, and hides when text arrives", () => {
    // Given
    const view = renderComponent(<Harness activity="10" live />)

    // When
    act(() => {
      vi.advanceTimersByTime(WORKING_AFTER_MS - 1)
    })

    // Then
    expect(screen.queryByText("Working")).toBeNull()

    // When
    act(() => {
      vi.advanceTimersByTime(1)
    })

    // Then
    expect(screen.getByText("Working")).toBeInTheDocument()

    // When text arrives, the wait starts over
    view.rerender(<Harness activity="42" live />)

    // Then
    expect(screen.queryByText("Working")).toBeNull()
    act(() => {
      vi.advanceTimersByTime(WORKING_AFTER_MS)
    })
    expect(screen.getByText("Working")).toBeInTheDocument()
  })

  it("never shows when the answer is not running", () => {
    // Given
    renderComponent(<Harness activity="10" live={false} />)

    // When
    act(() => {
      vi.advanceTimersByTime(WORKING_AFTER_MS * 5)
    })

    // Then
    expect(screen.queryByText("Working")).toBeNull()
  })
})
