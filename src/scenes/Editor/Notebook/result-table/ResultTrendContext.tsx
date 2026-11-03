import { createContext, useContext } from "react"
import type { ResultTrendStore } from "./resultTrendStore"

const ResultTrendContext = createContext<ResultTrendStore | null>(null)

export const ResultTrendProvider = ResultTrendContext.Provider

export const useResultTrendStore = (): ResultTrendStore => {
  const store = useContext(ResultTrendContext)
  if (!store) {
    throw new Error("useResultTrendStore needs a ResultTrendProvider")
  }
  return store
}
