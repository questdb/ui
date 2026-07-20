import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { NotebookCell } from "../../../../store/notebook"
import { on } from "../../../../utils/notebooks/notebookAIBridge"
import {
  CellVirtualizationEngine,
  type CellContentMode,
} from "./cellVirtualizationEngine"

const CellVirtualizationContext =
  createContext<CellVirtualizationEngine | null>(null)

export const CellVirtualizationProvider = CellVirtualizationContext.Provider

export const useCellVirtualizationEngine = () =>
  useContext(CellVirtualizationContext)

/* eslint-disable react-hooks/rules-of-hooks -- hook by behavior, named as a factory; call unconditionally from one component */
export const createVirtualizationEngine = (options: {
  bufferId: number
  cells: NotebookCell[]
  focusedCellId: string | null
  maximizedCellId: string | null
  runningCellIds: Iterable<string>
}): CellVirtualizationEngine => {
  const { bufferId, cells, focusedCellId, maximizedCellId, runningCellIds } =
    options
  const engine = useMemo(() => new CellVirtualizationEngine(), [])

  useEffect(() => () => engine.destroy(), [engine])

  // Recently-edited pins protect Monaco undo stacks.
  useEffect(
    () =>
      on("user-action", (evt) => {
        if (evt.kind === "user_updated_cell" && evt.bufferId === bufferId) {
          engine.noteCellEdited(evt.cellId)
        }
      }),
    [engine, bufferId],
  )

  useEffect(() => {
    engine.sync(cells)
  }, [engine, cells])

  useEffect(() => {
    engine.setFocusedCell(focusedCellId)
  }, [engine, focusedCellId])

  useEffect(() => {
    engine.setMaximizedCell(maximizedCellId)
  }, [engine, maximizedCellId])

  useEffect(() => {
    engine.setRunningCells(runningCellIds)
  }, [engine, runningCellIds])

  return engine
}
/* eslint-enable react-hooks/rules-of-hooks */

export const useCellContentMode = (cellId: string): CellContentMode => {
  const engine = useContext(CellVirtualizationContext)
  const [mode, setMode] = useState<CellContentMode>(() =>
    engine ? engine.getContentMode(cellId) : "full",
  )

  useEffect(() => {
    if (!engine) return
    setMode(engine.getContentMode(cellId))
    return engine.subscribe(cellId, () =>
      setMode(engine.getContentMode(cellId)),
    )
  }, [engine, cellId])

  return engine ? mode : "full"
}
