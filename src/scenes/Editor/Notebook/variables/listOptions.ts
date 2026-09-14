import type {
  ListSort,
  ListVariable,
  VariableOption,
} from "../../../../store/notebook"

const ALIAS = " as "

const scan = (
  text: string,
  visit: (char: string, insideQuotes: boolean, index: number) => void,
) => {
  let quote: string | null = null
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quote) {
      visit(char, true, index)
      if (char === quote) quote = null
    } else if (char === "'" || char === '"') {
      quote = char
      visit(char, true, index)
    } else {
      visit(char, false, index)
    }
  }
}

const splitEntries = (text: string): string[] => {
  const entries: string[] = []
  let current = ""
  scan(text, (char, insideQuotes) => {
    if (!insideQuotes && char === ",") {
      entries.push(current)
      current = ""
    } else {
      current += char
    }
  })
  entries.push(current)
  return entries
}

const normalizeWhitespace = (entry: string): string => {
  let result = ""
  let pendingSpace = false
  scan(entry, (char, insideQuotes) => {
    if (!insideQuotes && /\s/.test(char)) {
      pendingSpace = true
      return
    }
    if (pendingSpace && result !== "") result += " "
    pendingSpace = false
    result += char
  })
  return result
}

const lastAliasIndex = (entry: string): number => {
  let found = -1
  scan(entry, (_, insideQuotes, index) => {
    if (
      !insideQuotes &&
      entry.slice(index, index + ALIAS.length).toLowerCase() === ALIAS
    ) {
      found = index
    }
  })
  return found
}

const unquote = (label: string): string => {
  const quote = label[0]
  return label.length > 1 &&
    (quote === "'" || quote === '"') &&
    label.endsWith(quote)
    ? label.slice(1, -1)
    : label
}

const toOption = (entry: string): VariableOption => {
  const aliasAt = lastAliasIndex(entry)
  if (aliasAt < 0) return { value: entry, label: entry }
  const value = entry.slice(0, aliasAt)
  const label = unquote(entry.slice(aliasAt + ALIAS.length))
  return { value, label: label === "" ? value : label }
}

export const parseCustomEntries = (entries: string): VariableOption[] =>
  splitEntries(entries)
    .map(normalizeWhitespace)
    .filter((entry) => entry !== "")
    .map(toOption)

const stripDelimiters = (pattern: string): string =>
  pattern.length > 2 && pattern.startsWith("/") && pattern.endsWith("/")
    ? pattern.slice(1, -1)
    : pattern

export const compileRegex = (pattern: string): RegExp | null => {
  try {
    return new RegExp(stripDelimiters(pattern))
  } catch {
    return null
  }
}

const matchOption = (
  option: VariableOption,
  regex: RegExp,
): VariableOption | null => {
  const match = regex.exec(option.value)
  if (!match) return null
  const groups = match.groups
  if (groups?.value !== undefined) {
    return { value: groups.value, label: groups.text ?? groups.value }
  }
  if (match.length > 1 && match[1] !== undefined) {
    return { value: match[1], label: match[1] }
  }
  return option
}

export const applyRegex = (
  options: VariableOption[],
  pattern: string | undefined,
): VariableOption[] => {
  if (!pattern) return options
  const regex = compileRegex(pattern)
  if (!regex) return options
  return options.flatMap((option) => {
    const matched = matchOption(option, regex)
    return matched ? [matched] : []
  })
}

export const dedupeOptions = (options: VariableOption[]): VariableOption[] => {
  const seen = new Set<string>()
  return options.filter((option) => {
    if (seen.has(option.value)) return false
    seen.add(option.value)
    return true
  })
}

export const sortOptions = (
  options: VariableOption[],
  sort: ListSort,
): VariableOption[] => {
  if (sort === "none") return options
  const sorted = options.slice()
  switch (sort) {
    case "alphaAsc":
      return sorted.sort((a, b) => a.label.localeCompare(b.label))
    case "alphaDesc":
      return sorted.sort((a, b) => b.label.localeCompare(a.label))
    case "numAsc":
      return sorted.sort((a, b) => Number(a.value) - Number(b.value))
    case "numDesc":
      return sorted.sort((a, b) => Number(b.value) - Number(a.value))
  }
}

export const deriveListOptions = (
  variable: ListVariable,
  options: VariableOption[],
): VariableOption[] =>
  sortOptions(
    dedupeOptions(
      applyRegex(
        options,
        variable.source.type === "query" ? variable.source.regex : undefined,
      ),
    ),
    variable.sort,
  )

export const customListOptions = (variable: ListVariable): VariableOption[] =>
  variable.source.type === "custom"
    ? deriveListOptions(variable, parseCustomEntries(variable.source.entries))
    : []
