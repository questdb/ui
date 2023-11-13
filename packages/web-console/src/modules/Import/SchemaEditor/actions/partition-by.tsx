import React from "react"
import { DropdownMenu } from "@questdb/react-components"
import { Nav } from "../../../../modules/Import/panel"
import { PartitionBy, RequestColumn } from "../types"
import { useFormContext } from "react-hook-form"
import { withTooltip } from "../../../../utils"

const MenuNav = ({
  disabled,
  value,
}: {
  disabled: boolean
  value: React.ReactNode
}) => (
  <Nav disabled={disabled}>
    Partition <small>{value}</small>
  </Nav>
)

export const PartitionMenu = () => {
  const { watch, setValue } = useFormContext()
  const partitionBy = watch("partitionBy") as keyof typeof PartitionBy
  const enabled = (watch("columns") as RequestColumn[]).some(
    (col) => col.designated,
  )

  if (!enabled) {
    return withTooltip(
      <Nav aria-disabled={true} className={"disabled"}>
        <span>Partition</span>
      </Nav>,
      "Select one TIMESTAMP column as designated to enable partitioning.",
      { placement: "top" },
    )
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Nav>
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
