export const shortenText = (
  text: string,
  maxLength: number,
  ellipsis: string = "...",
): string => {
  if (text.length <= maxLength) {
    return text
  }

  const midpoint = Math.floor(text.length / 2)
  const charsToRemove = text.length - maxLength + ellipsis.length

  const shortenedText =
    text.slice(0, midpoint - Math.floor(charsToRemove / 2)) +
    ellipsis +
    text.slice(midpoint + Math.ceil(charsToRemove / 2))

  return shortenedText
}
