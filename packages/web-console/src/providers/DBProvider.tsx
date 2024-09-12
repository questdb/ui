import React, { createContext, useContext, useState } from "react"
import { db } from "../store/db"

const defaultValues = {
  db: undefined,
}

export const DBContext = createContext<{ db?: any }>(defaultValues)

export const DBProvider = ({ children }: { children: React.ReactNode }) => {
  const [ready, setReady] = useState(false)

  db.on("ready", () => {
    setReady(true)
  })

  if (!ready) return null

  return <DBContext.Provider value={{ db }}>{children}</DBContext.Provider>
}

export const useDB = () => useContext(DBContext)
