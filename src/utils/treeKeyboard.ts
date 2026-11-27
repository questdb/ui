export const getTreeBranchAction = (
  key: string,
  expanded: boolean | undefined,
  hasParent = false,
) => {
  if (key === "ArrowRight" && expanded !== undefined) {
    return expanded ? "first-child" : "expand"
  }
  if (key === "ArrowLeft") {
    if (expanded) return "collapse"
    if (hasParent) return "parent"
  }
  return undefined
}

export const getTreePageIndex = (
  direction: "up" | "down",
  focusedIndex: number | null,
  { startIndex, endIndex }: { startIndex: number; endIndex: number },
  itemCount: number,
) => {
  const edge = direction === "up" ? startIndex : endIndex
  if (focusedIndex !== null && focusedIndex !== edge) return edge

  const pageLength = endIndex - startIndex
  return direction === "up"
    ? Math.max(0, edge - pageLength)
    : Math.min(itemCount - 1, edge + pageLength)
}
