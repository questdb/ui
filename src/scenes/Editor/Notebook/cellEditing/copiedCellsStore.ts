import { useEffect, useState } from "react"
import type { CellClipboardPayload } from "./cellClipboardPayload"

let copiedCells: CellClipboardPayload | null = null
const listeners = new Set<() => void>()

export const getCopiedCells = (): CellClipboardPayload | null => copiedCells

export const setCopiedCells = (payload: CellClipboardPayload): void => {
  copiedCells = payload
  listeners.forEach((listener) => listener())
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
