// @vitest-environment jsdom
import {
  configuredOpenAI,
  getByHook,
  modelServer,
  renderAISettings,
  storedSettings,
} from "./test/setupHarness"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React, { useState } from "react"
import { describe, expect, it } from "vitest"
import { Button } from "../Button"
import { SettingsModal } from "./SettingsModal"

const levels = [
  {
    level: "write",
    label: "Write",
    permissions: { grantSchemaAccess: true, read: true, write: true },
  },
  {
    level: "none",
    label: "None",
    permissions: { grantSchemaAccess: false, read: false, write: false },
  },
  {
    level: "read",
    label: "Read",
    permissions: { grantSchemaAccess: true, read: true, write: false },
  },
  {
    level: "schema",
    label: "Schema access",
    permissions: { grantSchemaAccess: true, read: false, write: false },
  },
]
const schemaPermissions = levels[3].permissions

const ReopenableSettings = () => {
  const [open, setOpen] = useState(true)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Reopen settings</Button>
      {open && <SettingsModal open onOpenChange={setOpen} />}
    </>
  )
}

const selectPermission = async (level: string) => {
  await userEvent.click(getByHook("permissions-trigger"))
  await userEvent.click(getByHook(`permission-level-${level}`))
}

describe("AI permission settings", () => {
  it("saves permission scopes for the selected provider and restores them when reopened", async () => {
    // Given real settings with Schema access and a configured OpenAI provider
    modelServer()
    renderAISettings(<ReopenableSettings />, {
      ...configuredOpenAI,
      providers: {
        openai: {
          ...configuredOpenAI.providers.openai,
          ...schemaPermissions,
        },
      },
    })
    expect(getByHook("permissions-trigger")).toHaveTextContent("Schema access")

    // When the user saves Write, then None
    for (const choice of levels.slice(0, 2)) {
      await selectPermission(choice.level)
      expect(getByHook("permissions-trigger")).toHaveTextContent(choice.label)
      await userEvent.click(getByHook("ai-settings-save"))

      // Then storage contains the selected scopes and a new modal restores them
      await waitFor(() =>
        expect(storedSettings().providers?.openai).toMatchObject(
          choice.permissions,
        ),
      )
      await userEvent.click(
        screen.getByRole("button", { name: "Reopen settings" }),
      )
      expect(getByHook("permissions-trigger")).toHaveTextContent(choice.label)
    }

    // When the user cancels a Read draft
    await selectPermission("read")
    await userEvent.click(getByHook("ai-settings-cancel"))
    await userEvent.click(
      screen.getByRole("button", { name: "Reopen settings" }),
    )

    // Then the saved None permissions remain unchanged
    expect(storedSettings().providers?.openai).toMatchObject(
      levels[1].permissions,
    )
    expect(getByHook("permissions-trigger")).toHaveTextContent("None")
  })
})
