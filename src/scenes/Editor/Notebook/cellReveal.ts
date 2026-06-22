import type { IRange } from "monaco-editor"

export type CellRevealRequest = {
  bufferId: number
  cellId: string
  range: IRange
  notebookField: "cell" | "chartName"
  cellType: "sql" | "markdown"
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
