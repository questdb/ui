import React from "react"
import { DropdownMenu } from "@questdb/react-components"
import { Nav } from "../../../../modules/Import/panel"

export const DelimiterMenu = () => {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Nav>Delimiter</Nav>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start">
          <span>test</span>
          <DropdownMenu.Item>hi</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
