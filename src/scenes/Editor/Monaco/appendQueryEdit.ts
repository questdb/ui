export const appendQueryEdit = (
  existing: string,
  cursorLine: number,
  query: string,
  needsSemicolon: boolean,
) => {
  const queryLines = query.split("\n")
  const lineStart = existing.split("\n").length + 1
  const firstLine = cursorLine === 1
  const selectedLine = lineStart + (firstLine ? 0 : 1)
  return {
    lineStart,
    text: `${needsSemicolon ? ";" : ""}${"\n".repeat(firstLine ? 1 : 2)}${query}`,
    selection: {
      startLineNumber: selectedLine,
      endLineNumber: selectedLine + queryLines.length - 1,
      startColumn: 1,
      endColumn: queryLines[queryLines.length - 1].length + 1,
    },
  }
}
