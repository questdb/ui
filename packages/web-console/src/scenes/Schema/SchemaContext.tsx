import React, { createContext, useContext, useRef, useState, useMemo } from "react"
import { TreeNodeKind } from "../../components/Tree"

export const ScrollDefaults = {
  scrollerRef: { current: null },
  scrollBy: () => {},
  setScrollerRef: () => {},
}

export const SchemaContext = createContext<{
  query: string
  setQuery: (query: string) => void
  scrollerRef: React.MutableRefObject<HTMLElement | null>,
  scrollBy: (amount: number) => void,
  setScrollerRef: (element: HTMLElement | null) => void,
  selectOpen: boolean
  setSelectOpen: (open: boolean) => void
  selectedTables: {name: string, type: TreeNodeKind}[]
  setSelectedTables: (tables: {name: string, type: TreeNodeKind}[]) => void
  handleSelectToggle: ({name, type}: {name: string, type: TreeNodeKind}) => void
  selectedTablesMap: Map<string, {name: string, type: TreeNodeKind}>
}>({
  query: "",
  setQuery: () => {},
  ...ScrollDefaults,
  selectOpen: false,
  setSelectOpen: () => {},
  selectedTables: [],
  setSelectedTables: () => {},
  handleSelectToggle: () => {},
  selectedTablesMap: new Map(),
})

export const useSchema = () => {
  const context = useContext(SchemaContext)
  if (!context) {
    throw new Error('useSchema must be used within SchemaProvider')
  }
  return context
}

export const SchemaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [query, setQuery] = useState("")
  const scrollerRef = useRef<HTMLElement | null>(null)
  const [selectOpen, _setSelectOpen] = useState(false)
  const [selectedTables, setSelectedTables] = useState<{name: string, type: TreeNodeKind}[]>([])

  const selectedTablesMap = useMemo(() => new Map(
    selectedTables.map(table => [`${table.name}-${table.type}`, table])
  ), [selectedTables])

  const handleSelectToggle = ({name, type}: {name: string, type: TreeNodeKind}) => {
    const key = `${name}-${type}`
    if (selectedTablesMap.has(key)) {
      setSelectedTables(selectedTables.filter(t => `${t.name}-${t.type}` !== key))
    } else {
      setSelectedTables([...selectedTables, {name, type}])
    }
  }

  const setSelectOpen = (open: boolean) => {
    _setSelectOpen(open)

    if (!open) {
      setSelectedTables([])
    }
  }

  const scrollBy = (amount: number) => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollBy({ top: amount })
    }
  }

  const setScrollerRef = (element: HTMLElement | null) => {
    scrollerRef.current = element
  }

  return (
    <SchemaContext.Provider value={{
      query,
      setQuery,
      scrollerRef,
      scrollBy,
      setScrollerRef,
      selectOpen,
      setSelectOpen,
      selectedTables,
      setSelectedTables,
      handleSelectToggle,
      selectedTablesMap,
    }}>
      {children}
    </SchemaContext.Provider>
  )
}
