import React from "react"
import { DropdownMenu } from "@questdb/react-components"
import { Nav } from "../../../../modules/Import/panel"
import { PartitionBy, RequestColumn } from "../types"
import { useFormContext } from "react-hook-form"

export const PartitionMenu = () => {
  const { watch, setValue } = useFormContext()
  const partitionBy = watch("partitionBy") as keyof typeof PartitionBy
  const enabled = (watch("columns") as RequestColumn[]).some(
    (col) => col.designated,
  )

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Nav disabled={!enabled}>
          <span>
            Partition <small>{PartitionBy[partitionBy]}</small>
          </span>
        </Nav>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          side="bottom"
          avoidCollisions={false}
        >
          {Object.entries(PartitionBy).map(([key, label]) => (
            <DropdownMenu.CheckboxItem
              key={key}
              checked={partitionBy === key}
              onSelect={() => setValue("partitionBy", key)}
            >
              <DropdownMenu.ItemIndicator>✔</DropdownMenu.ItemIndicator>
              {label}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
