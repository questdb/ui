// @vitest-environment jsdom
import React, { useState } from "react"
import { act, fireEvent, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import { Button } from "../../../../components/Button"
import { Dialog } from "../../../../components/Dialog"
import { SettingsDrawerShell } from "./SettingsDrawerShell"

const pressEscape = () =>
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
      code: "Escape",
    })
  })

// Like SuspensionDialog: its own Escape handler closes it, whether or not the
// event was already claimed.
const Harness = ({ onDismiss }: { onDismiss: () => void }) => {
  const [dialogOpen, setDialogOpen] = useState(false)
  return (
    <>
      <SettingsDrawerShell
        presentation="drawer"
        open
        title="Chart settings"
        dataHookBase="chart-settings"
        onDismiss={onDismiss}
        onCommit={vi.fn()}
      >
        <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
      </SettingsDrawerShell>
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Content
            data-hook="modal-dialog"
            aria-describedby={undefined}
            onEscapeKeyDown={() => setDialogOpen(false)}
          >
            <Dialog.Title>Resume WAL</Dialog.Title>
            <Button>Confirm</Button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

describe("SettingsDrawerShell Escape", () => {
  it("closes the drawer when nothing is open on top of it", () => {
    const onDismiss = vi.fn()
    renderComponent(<Harness onDismiss={onDismiss} />)
    pressEscape()
    expect(onDismiss).toHaveBeenCalledWith("escape")
  })

  it("lets a modal dialog opened over it close first, one per press", () => {
    const onDismiss = vi.fn()
    renderComponent(<Harness onDismiss={onDismiss} />)
    fireEvent.click(screen.getByText("Open dialog"))
    expect(screen.getByRole("dialog", { name: "Resume WAL" })).toBeVisible()

    pressEscape()
    expect(screen.queryByRole("dialog", { name: "Resume WAL" })).toBeNull()
    expect(onDismiss).not.toHaveBeenCalled()

    pressEscape()
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledWith("escape")
  })
})
