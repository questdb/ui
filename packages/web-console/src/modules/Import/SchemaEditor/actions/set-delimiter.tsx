import React from "react"
import { DropdownMenu } from "@questdb/react-components"
import { Nav } from "../../../../modules/Import/panel"
import { Form } from "../../../../components/Form"
import { useFormContext } from "react-hook-form"

const common = [
  ["Comma", ","],
  ["Tab", "\\t"],
  ["Semicolon", ";"],
]

export const DelimiterMenu = () => {
  const { watch, setValue } = useFormContext()
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
          <DropdownMenu.Item>
            <Form.Input
              name={"delimiter"}
              onClick={(e) => {
                e.stopPropagation()
              }}
              // @TODO: something screwy with kb focus
            />
          </DropdownMenu.Item>
          <DropdownMenu.Label>Common options</DropdownMenu.Label>
          {common.map(([label, value]) => (
            <DropdownMenu.CheckboxItem
              key={label}
              checked={delimiter === value}
              onClick={() => setValue("delimiter", value)}
            >
              <DropdownMenu.ItemIndicator>✔</DropdownMenu.ItemIndicator>
              <span>{label}</span> <small>{value}</small>
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
