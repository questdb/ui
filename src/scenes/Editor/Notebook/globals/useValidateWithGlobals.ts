import { useContext, useMemo } from "react"
import { QuestContext } from "../../../../providers/QuestProvider"
import { useNotebookActions } from "../NotebookProvider"
import { createValidateWithGlobals } from "../declareUtils"

export const useValidateWithGlobals = () => {
  const { quest } = useContext(QuestContext)
  const { getVariables } = useNotebookActions()

  return useMemo(
    () => createValidateWithGlobals(quest, getVariables),
    [quest, getVariables],
  )
}
