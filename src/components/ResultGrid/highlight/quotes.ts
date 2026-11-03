const QUOTES = ["'", '"']

const quoteAt = (text: string, index: number): string | null =>
  QUOTES.includes(text[index]) ? text[index] : null

// A quote counts only as a matched pair around the whole value.
export const hasUnmatchedQuote = (value: number | string): boolean => {
  const text = String(value).trim()
  const opening = quoteAt(text, 0)
  const closing = quoteAt(text, text.length - 1)
  return opening !== closing || (opening !== null && text.length < 2)
}

// SQL habits carry over: a typed 'EURUSD' or "EURUSD" means EURUSD.
export const unquoted = (value: number | string): string => {
  const text = String(value).trim()
  return quoteAt(text, 0) !== null && !hasUnmatchedQuote(text)
    ? text.slice(1, -1)
    : text
}
