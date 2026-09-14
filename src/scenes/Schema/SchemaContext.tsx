import React, { createContext, useContext, useState, useMemo } from "react"
import type { TableKind } from "../../utils/questdb/types"

export type SelectedTable = { name: string; type: TableKind }

export const SchemaContext = createContext<{
  query: string
  setQuery: (query: string) => void
  selectOpen: boolean
  setSelectOpen: (open: boolean) => void
  selectedTables: SelectedTable[]
  setSelectedTables: (tables: SelectedTable[]) => void
  handleSelectToggle: (table: SelectedTable) => void
  selectedTablesMap: Map<string, SelectedTable>
  focusedIndex: number | null
  setFocusedIndex: (index: number | null) => void
}>({
  query: "",
  setQuery: () => {},
  selectOpen: false,
  setSelectOpen: () => {},
  selectedTables: [],
  setSelectedTables: () => {},
  handleSelectToggle: () => {},
  selectedTablesMap: new Map(),
  focusedIndex: null,
  setFocusedIndex: () => {},
})

export const useSchema = () => {
  const context = useContext(SchemaContext)
  if (!context) {
    throw new Error("useSchema must be used within SchemaProvider")
  }
  return context
}

export const SchemaProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [query, setQuery] = useState("")
  const [selectOpen, _setSelectOpen] = useState(false)
  const [selectedTables, setSelectedTables] = useState<SelectedTable[]>([])
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

  const selectedTablesMap = useMemo(
    () =>
      new Map(
        selectedTables.map((table) => [`${table.name}-${table.type}`, table]),
      ),
    [selectedTables],
  )

  const handleSelectToggle = ({ name, type }: SelectedTable) => {
    const key = `${name}-${type}`
    if (selectedTablesMap.has(key)) {
      setSelectedTables(
        selectedTables.filter((t) => `${t.name}-${t.type}` !== key),
      )
    } else {
      setSelectedTables([...selectedTables, { name, type }])
    }
  }

  const setSelectOpen = (open: boolean) => {
    _setSelectOpen(open)

    if (!open) {
      setSelectedTables([])
    }
  }

  return (
    <SchemaContext.Provider
      value={{
        query,
        setQuery,
        selectOpen,
        setSelectOpen,
        selectedTables,
        setSelectedTables,
        handleSelectToggle,
        selectedTablesMap,
        focusedIndex,
        setFocusedIndex,
      }}
    >
      {children}
    </SchemaContext.Provider>
  )
}
