import { useContext, useMemo } from "react"
import { QuestContext } from "../../../../providers/QuestProvider"
import { useNotebookActions } from "../NotebookProvider"
import { createValidateWithGlobals } from "../declareUtils"

export const useValidateWithGlobals = (cellId: string) => {
  const { quest } = useContext(QuestContext)
  const { getCellDeclareEntries } = useNotebookActions()

  return useMemo(
    () => createValidateWithGlobals(quest, () => getCellDeclareEntries(cellId)),
    [quest, getCellDeclareEntries, cellId],
  )
}
