import type { HighlightConfig } from "./types"

export type PatternTest = (text: string) => boolean

type Re2Module = typeof import("re2js")

// RE2 matches in linear time, so no pattern a user or an agent sends can
// stall the grid; the price is no backreferences and no lookarounds. It also
// costs about 44 kB gzip, so it loads only once a rule needs a pattern. A
// failed load resolves false and is retried on the next call, so validation
// can report it and a later save can recover.
let re2: Re2Module | null = null
let loading: Promise<boolean> | null = null

export const isRe2Ready = (): boolean => re2 !== null

export const loadRe2 = (): Promise<boolean> => {
  loading ??= import("re2js").then(
    (module) => {
      re2 = module
      return true
    },
    () => {
      loading = null
      return false
    },
  )
  return loading
}

export const usesPatterns = (config: HighlightConfig): boolean =>
  config.rules.some(
    (rule) => rule.kind === "value" && rule.condition.op === "matches",
  )

// A pattern is case-sensitive; `(?i)` inside it switches case off. Slashes
// are ordinary characters, so a path-like pattern matches paths. A pattern
// that does not compile never matches instead of throwing mid-render. Until
// RE2 has loaded nothing compiles, so callers load it first.
export const compilePattern = (pattern: string): PatternTest | null => {
  if (re2 === null) return null
  try {
    const compiled = re2.RE2JS.compile(pattern.trim())
    return (value) => compiled.test(value)
  } catch {
    return null
  }
}
