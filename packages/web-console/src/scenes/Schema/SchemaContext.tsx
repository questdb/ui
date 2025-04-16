import React, { createContext, useContext, useRef, useState } from "react"

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
}>({
  query: "",
  setQuery: () => {},
  ...ScrollDefaults,
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
    }}>
      {children}
    </SchemaContext.Provider>
  )
}
