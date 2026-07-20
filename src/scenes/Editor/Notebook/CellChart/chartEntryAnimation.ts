const settledBuffers = new Set<number>()

export const shouldAnimateChartEntry = (bufferId: number): boolean =>
  !settledBuffers.has(bufferId)

export const settleChartEntryAnimation = (bufferId: number): void => {
  settledBuffers.add(bufferId)
}

export const resetChartEntryAnimation = (bufferId: number): void => {
  settledBuffers.delete(bufferId)
}
