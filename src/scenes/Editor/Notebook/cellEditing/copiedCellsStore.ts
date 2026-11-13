import { useEffect, useState } from "react"
import { unstable_batchedUpdates } from "react-dom"
import type { CellClipboardPayload } from "./cellClipboardPayload"

let copiedCells: CellClipboardPayload | null = null
const listeners = new Set<() => void>()

export const getCopiedCells = (): CellClipboardPayload | null => copiedCells

// A copy from the keyboard runs in a native listener, where React 17 does
// not batch: without the batch, every Paste Cell button (one per cell in list
// layout) would commit on its own.
export const setCopiedCells = (payload: CellClipboardPayload): void => {
  copiedCells = payload
  unstable_batchedUpdates(() => listeners.forEach((listener) => listener()))
}

const subscribeCopiedCells = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useCopiedCells = (): CellClipboardPayload | null => {
  const [payload, setPayload] = useState(getCopiedCells)

  useEffect(() => {
    setPayload(getCopiedCells())
    return subscribeCopiedCells(() => setPayload(getCopiedCells()))
  }, [])

  return payload
}
