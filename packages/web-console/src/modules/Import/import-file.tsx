import React, { createContext, useReducer } from "react"
import { DropBox } from "./dropbox"
import { Settings } from "./settings"
import { Result } from "./result"

export const Context = createContext({})

type State = {
  step: "dropbox" | "settings" | "result"
  // TODO: file+schema
}

const initialState: State = {
  step: "dropbox",
}

const reducer = (state: typeof initialState, action: Partial<State>) => ({
  ...state,
  ...action,
})

export const ImportFile = () => {
  const [state, dispatch] = useReducer(reducer, initialState)

  return (
    <Context.Provider value={{ state, dispatch }}>
      {state.step === "dropbox" && <DropBox />}
      {state.step === "settings" && <Settings />}
      {state.step === "result" && <Result />}
    </Context.Provider>
  )
}
