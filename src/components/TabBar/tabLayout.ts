export const TAB_CONTENT_MIN_WIDTH = 150
export const TAB_CONTENT_MAX_WIDTH = 240
export const NEW_TAB_BUTTON_AREA = 90

export const computeTabWidths = (
  rootWidth: number,
  count: number,
): number[] => {
  if (count === 0) return []
  const availableWidth = rootWidth - NEW_TAB_BUTTON_AREA
  const targetWidth = availableWidth / count
  const clampedWidth = Math.floor(
    Math.max(
      TAB_CONTENT_MIN_WIDTH,
      Math.min(TAB_CONTENT_MAX_WIDTH, targetWidth),
    ),
  )
  let extraPixels = availableWidth - clampedWidth * count

  const widths: number[] = []
  for (let index = 0; index < count; index += 1) {
    const extra =
      clampedWidth < TAB_CONTENT_MAX_WIDTH && extraPixels > 0 ? 1 : 0
    widths.push(clampedWidth + extra)
    if (extraPixels > 0) extraPixels -= 1
  }
  return widths
}

export const cumulativePositions = (widths: number[]): number[] => {
  const positions: number[] = []
  let position = 0
  for (const width of widths) {
    positions.push(position)
    position += width
  }
  return positions
}

export const closestSlotIndex = (x: number, positions: number[]): number => {
  let closestIndex = -1
  let closestDistance = Infinity
  positions.forEach((position, index) => {
    const distance = Math.abs(x - position)
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = index
    }
  })
  return closestIndex
}

export const displayedIndexDuringDrag = (
  index: number,
  fromIndex: number,
  toIndex: number,
): number => {
  if (index === fromIndex) return toIndex
  if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
    return index - 1
  }
  if (toIndex < fromIndex && index >= toIndex && index < fromIndex) {
    return index + 1
  }
  return index
}
