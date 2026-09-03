export type CellHydration = {
  // Mirrors the renderer's hydration-aware result reservation. Persisted cell
  // state alone cannot distinguish a result that is still loading/released
  // from one whose snapshot is known to be missing.
  expectingResult: boolean
}

const hydrations = new Map<
  number,
  Map<string, { token: symbol; value: CellHydration }>
>()

// Runtime-only: hydration state never reaches the notebook document, but the
// layout tools derive grid heights from it, so mounted cells publish it here.
export const publishCellHydration = (
  bufferId: number,
  cellId: string,
  value: CellHydration,
): (() => void) => {
  const token = Symbol(cellId)
  const cells =
    hydrations.get(bufferId) ??
    new Map<string, { token: symbol; value: CellHydration }>()
  cells.set(cellId, { token, value })
  hydrations.set(bufferId, cells)

  return () => {
    const current = hydrations.get(bufferId)?.get(cellId)
    if (current?.token !== token) return
    cells.delete(cellId)
    if (cells.size === 0) hydrations.delete(bufferId)
  }
}

export const readCellHydration = (
  bufferId: number,
  cellId: string,
): CellHydration | undefined => hydrations.get(bufferId)?.get(cellId)?.value

export const __resetCellHydrationStoreForTests = (): void => {
  hydrations.clear()
}
