import React from "react"
import { DropdownMenu } from "@questdb/react-components"
import { Nav } from "../../../../modules/Import/panel"
import { PartitionBy } from "../types"
import { useFormContext } from "react-hook-form"

export const PartitionMenu = () => {
  const { watch, setValue } = useFormContext()
  const partitionBy = watch("partitionBy")

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Nav>
          <span>
            Partition{" "}
            <small>
              {PartitionBy[partitionBy as keyof typeof PartitionBy]}
            </small>
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
            <DropdownMenu.Item
              key={key}
              onSelect={() => setValue("partitionBy", key)}
            >
              {label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
