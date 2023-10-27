import React, { createContext, useReducer } from "react"
import { DropBox } from "./dropbox"
import { Settings } from "./settings"
import { Result } from "./result"

type State = {
  step: "dropbox" | "settings" | "result"
  file?: File
  fileChunk?: File
}

const initialState: State = {
  step: "dropbox",
  file: undefined,
  fileChunk: undefined,
}

export const ImportContext = createContext({
  state: initialState,
  dispatch: (action: Partial<State>) => {},
})

const reducer = (state: typeof initialState, action: Partial<State>) => ({
  ...state,
  ...action,
})

export const ImportFile = () => {
  const [state, dispatch] = useReducer(reducer, initialState)

  return (
    <ImportContext.Provider value={{ state, dispatch }}>
      {state.step === "dropbox" && <DropBox />}
      {state.step === "settings" && <Settings />}
      {state.step === "result" && <Result />}
    </ImportContext.Provider>
  )
}
