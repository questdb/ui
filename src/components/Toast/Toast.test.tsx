// @vitest-environment jsdom
import React, { act } from "react"
import { fireEvent, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderComponent } from "../../test/component"
import { ToastContainer, toast } from "."

describe("ToastContainer", () => {
  // Alt+T adds an editor tab; pressed elsewhere it must not move focus.
  it("leaves focus where it is on Alt+T while a toast is shown", async () => {
    renderComponent(
      <>
        <textarea aria-label="cell" />
        <ToastContainer />
      </>,
    )
    const cell = document.querySelector("textarea") as HTMLTextAreaElement
    cell.focus()
    act(() => {
      toast.success("Copied to clipboard")
    })
    await waitFor(() =>
      expect(document.querySelector(".Toastify__toast")).not.toBeNull(),
    )

    fireEvent.keyDown(cell, { key: "t", code: "KeyT", altKey: true })

    expect(document.activeElement).toBe(cell)
  })
})
