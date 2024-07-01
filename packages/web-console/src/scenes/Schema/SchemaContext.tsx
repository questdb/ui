import { createContext } from "react"

export const SchemaContext = createContext<{
  query: string
  setQuery: (query: string) => void
}>({
  query: "",
  setQuery: () => {},
})
