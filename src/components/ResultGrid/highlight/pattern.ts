import type { HighlightConfig } from "./types"

export type PatternTest = (text: string) => boolean

type Re2Module = typeof import("re2js")

// RE2 matches in linear time, so no pattern a user or an agent sends can
// stall the grid; the price is no backreferences and no lookarounds. It also
// costs about 44 kB gzip, so it loads only once a rule needs a pattern.
let re2: Re2Module | null = null
let loading: Promise<Re2Module> | null = null

export const isRe2Ready = (): boolean => re2 !== null

export const loadRe2 = (): Promise<void> => {
  loading ??= import("re2js").then((module) => {
    re2 = module
    return module
  })
  return loading.then(() => undefined)
}

export const usesPatterns = (config: HighlightConfig): boolean =>
  config.rules.some(
    (rule) => rule.kind === "value" && rule.condition.op === "matches",
  )

// g changes nothing for a single test, and RE2 is Unicode-aware by default.
const NO_EFFECT_FLAGS = new Set(["g", "u"])

const re2FlagBits = (module: Re2Module, flags: string): number | null => {
  const bits: Record<string, number> = {
    i: module.RE2JS.CASE_INSENSITIVE,
    m: module.RE2JS.MULTILINE,
    s: module.RE2JS.DOTALL,
  }
  let combined = 0
  for (const flag of flags) {
    if (NO_EFFECT_FLAGS.has(flag)) continue
    const bit = bits[flag]
    if (bit === undefined) return null
    combined |= bit
  }
  return combined
}

// `/pattern/flags` carries flags; a bare pattern is case-sensitive. A pattern
// that does not compile never matches instead of throwing mid-render. Until
// RE2 has loaded nothing compiles, so callers load it first.
export const compilePattern = (pattern: string): PatternTest | null => {
  if (re2 === null) return null
  const text = pattern.trim()
  const slashed = /^\/(.+)\/([a-z]*)$/.exec(text)
  const source = slashed ? slashed[1] : text
  const flags = slashed ? slashed[2] : ""
  const bits = re2FlagBits(re2, flags)
  if (bits === null) return null
  try {
    const compiled = re2.RE2JS.compile(source, bits)
    return (value) => compiled.test(value)
  } catch {
    return null
  }
}
