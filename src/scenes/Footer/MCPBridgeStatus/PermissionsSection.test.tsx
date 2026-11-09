// @vitest-environment jsdom
import React, { useState } from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { renderComponent, getHook as getByHook } from "../../../test/component"
import type { Permissions } from "../../../utils/tools/permissions"
import { PermissionsSection } from "./PermissionsSection"

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

describe("PermissionsSection", () => {
  it("offers all four levels and emits their complete permission scopes", async () => {
    // Given a controlled permission selector with Schema access
    const onChange = vi.fn()
    const ControlledPermissions = () => {
      const [value, setValue] = useState<Permissions>(schemaPermissions)
      return (
        <PermissionsSection
          value={value}
          onChange={(permissions) => {
            onChange(permissions)
            setValue(permissions)
          }}
        />
      )
    }
    renderComponent(<ControlledPermissions />)
    expect(getByHook("permissions-trigger")).toHaveTextContent("Schema access")

    // When the user selects each level in the real menu
    for (const { level, label, permissions } of levels) {
      await userEvent.click(getByHook("permissions-trigger"))
      expect(screen.getAllByRole("menuitemradio")).toHaveLength(4)
      for (const option of levels)
        expect(getByHook(`permission-level-${option.level}`)).toHaveTextContent(
          option.label,
        )
      await userEvent.click(getByHook(`permission-level-${level}`))

      // Then the callback receives every scope and the trigger shows the selection
      expect(onChange).toHaveBeenLastCalledWith(permissions)
      expect(getByHook("permissions-trigger")).toHaveTextContent(label)
    }
    expect(onChange).toHaveBeenCalledTimes(4)
  })
})
