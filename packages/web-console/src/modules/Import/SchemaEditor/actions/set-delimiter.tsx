import React from "react"
import { DropdownMenu } from "@questdb/react-components"
import { Nav } from "../../../../modules/Import/panel"
import { useFormContext } from "react-hook-form"

const common = [
  ["Comma", ","],
  ["Tab", "\\t"],
  ["Semicolon", ";"],
]

export const DelimiterMenu = () => {
  const { watch } = useFormContext()
  const delimiter = watch("delimiter")
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Nav>
          <span>Delimiter</span> {delimiter && <small> {delimiter}</small>}
        </Nav>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start">
          <span>Common options</span>
          {common.map(([label, value]) => (
            <DropdownMenu.Item key={label}>
              <span>{label}</span> <small>{value}</small>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
