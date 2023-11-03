import React from "react"
import { DropdownMenu } from "@questdb/react-components"
import { Nav } from "../../../../modules/Import/panel"
import { PartitionBy } from "../types"

export const PartitionMenu = () => {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Nav>Partition</Nav>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start">
          {Object.entries(PartitionBy).map(([key, label]) => 
            <DropdownMenu.Item key={key} textValue={key}>{label}</DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
