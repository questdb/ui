import React, { useContext } from "react"
import { ImportContext } from "./import-file"

export const Settings = () => {
  const { state, dispatch } = useContext(ImportContext)

  return (
    <span onClick={() => dispatch({ step: "result" })}>
      Settings for the chunk: {state.fileChunk?.name}
    </span>
  )
}
