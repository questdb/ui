import { useContext, useEffect, useState } from "react"
import { QuestContext } from "../providers"
import type { QueryExecutionSnapshot } from "../utils/questdb"

export const useQueryExecutionState = (): QueryExecutionSnapshot => {
  const { questExecution } = useContext(QuestContext)
  const [snapshot, setSnapshot] = useState(() => questExecution.getSnapshot())

  useEffect(() => {
    const sync = () => setSnapshot(questExecution.getSnapshot())
    sync()
    return questExecution.subscribe(sync)
  }, [questExecution])

  return snapshot
}
