// An image an agent sent is kept in its reply as a data URL, which can run to
// a megabyte. A model reading the conversation back gets a placeholder.
const INLINE_IMAGE = /!\[([^\]]*)\]\(data:image\/[^)]*\)/g

export const hasInlineImages = (text: string): boolean =>
  text.includes("](data:image/")

export const withoutInlineImages = (text: string): string =>
  hasInlineImages(text)
    ? text.replace(INLINE_IMAGE, (_match, alt: string) =>
        alt ? `[image: ${alt}]` : "[image]",
      )
    : text

// The data URL of an inline image cut out of a text, and where in the cut
// text it goes back.
export type InlineImageCut = { at: number; dataUrl: string }

// Cuts the data URLs out of a text's inline images, leaving `![alt]()`.
export const cutInlineImages = (
  text: string,
): { text: string; cuts: InlineImageCut[] } => {
  if (!hasInlineImages(text)) return { text, cuts: [] }
  const cuts: InlineImageCut[] = []
  let cutText = ""
  let copiedTo = 0
  for (const match of text.matchAll(INLINE_IMAGE)) {
    // The URL runs from after `![alt](` to before the closing parenthesis.
    const urlStart = match.index + match[1].length + 4
    const urlEnd = match.index + match[0].length - 1
    cutText += text.slice(copiedTo, urlStart)
    cuts.push({ at: cutText.length, dataUrl: text.slice(urlStart, urlEnd) })
    copiedTo = urlEnd
  }
  return { text: cutText + text.slice(copiedTo), cuts }
}

// Puts back the data URLs cutInlineImages cut out of the text.
export const pasteInlineImages = (
  text: string,
  cuts: InlineImageCut[],
): string => {
  let pasted = ""
  let copiedTo = 0
  for (const { at, dataUrl } of cuts) {
    pasted += text.slice(copiedTo, at) + dataUrl
    copiedTo = at
  }
  return pasted + text.slice(copiedTo)
}
