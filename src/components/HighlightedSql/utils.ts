const CONTROL_CHARACTER_RANGES: ReadonlyArray<[number, number]> = [
  [0x0000, 0x0008],
  [0x000b, 0x000c],
  [0x000e, 0x001f],
  [0x007f, 0x009f],
  [0x061c, 0x061c],
  [0x200e, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
]

const CONTROL_CHARACTERS = new RegExp(
  `[${CONTROL_CHARACTER_RANGES.map(
    ([from, to]) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`,
  ).join("")}]`,
  "g",
)

const codePointLabel = (character: string) =>
  `U+${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`

export const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

export const markControlCharacters = (html: string) =>
  html.replace(
    CONTROL_CHARACTERS,
    (character) =>
      `<span class="control-character">[${codePointLabel(character)}]</span>`,
  )
