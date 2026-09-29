import type { IRange } from "monaco-editor"

// "highlight" flashes the range, as for a search hit. "edit" places the cursor
// at the range start and gives the editor keyboard focus, as for an insert.
export type CellRevealMode = "highlight" | "edit"

export type CellRevealRequest = {
  bufferId: number
  cellId: string
  range: IRange
  notebookField: "cell" | "chartName"
  cellType: "sql" | "markdown"
  mode: CellRevealMode
  token: number
}

type CellRevealInput = Omit<CellRevealRequest, "token">

// Parks a search-result reveal until the (async-mounting) notebook and cell editor drain
// it. Staleness is by token supersession — a newer request invalidates an older in-flight
// one — not wall-clock, so a slow cold mount still reveals.
let pending: CellRevealRequest | null = null
let tokenSeq = 0

export const requestCellReveal = (input: CellRevealInput): number => {
  const token = ++tokenSeq
  pending = { ...input, token }
  return token
}

export const getPendingReveal = (): CellRevealRequest | null => pending

export const consumeReveal = (token: number): void => {
  if (pending && pending.token === token) {
    pending = null
  }
}

export const clearPendingReveal = (): void => {
  pending = null
}
