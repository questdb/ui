// @vitest-environment jsdom
import React from "react"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it } from "vitest"
import { renderComponent } from "../../../test/component"
import { ImageAttachments } from "./ImageAttachments"

it("closes a sent-image preview by keyboard or pointer and returns focus to its opener", async () => {
  const user = userEvent.setup()
  renderComponent(
    <ImageAttachments
      images={[
        { mimeType: "image/png", data: "AAAA" },
        { mimeType: "image/png", data: "AAAB" },
      ]}
    />,
  )
  const opener = screen.getByRole("button", {
    name: "Open attachment 2 at full size",
  })
  opener.focus()
  await user.keyboard("{Enter}")
  const dialog = screen.getByRole("dialog", { name: "Attachment 2" })
  const close = within(dialog).getByRole("button", { name: "Close" })
  expect(close).toHaveFocus()
  await user.keyboard("{Enter}")
  expect(dialog).not.toBeInTheDocument()
  await waitFor(() => expect(opener).toHaveFocus())

  await user.click(opener)
  await user.click(screen.getByRole("button", { name: "Close" }))
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  await waitFor(() => expect(opener).toHaveFocus())
})
