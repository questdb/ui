export const escapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }

  return text.replace(/[&<>"']/g, (m) => map[m])
}

export const unescapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#039;": "'",
    "&nbsp;": "\u00A0",
  }

  return text.replace(/&(amp|lt|gt|quot|#039|nbsp);/g, (m) => map[m])
}
