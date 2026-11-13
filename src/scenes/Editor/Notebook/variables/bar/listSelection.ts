import type {
  ListVariable,
  VariableOption,
} from "../../../../../store/notebook"

export type ListSelection = ListVariable["selected"]

export const toggleOption = (
  selection: ListSelection,
  option: VariableOption,
): ListSelection => {
  if (selection === "all") return [option]
  const without = selection.filter((o) => o.value !== option.value)
  return without.length === selection.length ? [...selection, option] : without
}

export const sameSelection = (a: ListSelection, b: ListSelection): boolean => {
  if (a === "all" || b === "all") return a === b
  return (
    a.length === b.length && a.every((o, index) => o.value === b[index].value)
  )
}
