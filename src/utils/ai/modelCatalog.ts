export type ProviderModel = {
  id: string
  label?: string
  created?: number
}

const DATE_SUFFIX = /-(\d{8}|\d{4}-\d{2}-\d{2}|\d{4})$/

// Models released since GPT-5 are eligible for the picker; older models remain
// available through manual entry.
const GPT5_LAUNCH_START = Date.UTC(2025, 7, 1) / 1000

const OPENAI_NON_CHAT_TOKENS = [
  "embedding",
  "tts",
  "whisper",
  "audio",
  "realtime",
  "image",
  "dall-e",
  "sora",
  "transcribe",
  "transcription",
  "moderation",
  "search",
  "codex",
  "computer-use",
  "chat-latest",
  // Research-tier models: minutes of reasoning with no streamed output or
  // summaries — they read as unresponsive in an interactive chat.
  "-pro",
  "chatgpt",
  "babbage",
  "davinci",
  "instruct",
]

export const stripDateSuffix = (id: string): string =>
  id.replace(DATE_SUFFIX, "")

const isNumericToken = (token: string): boolean => /^[\d.]+$/.test(token)

export const formatModelLabel = (id: string): string => {
  const dateSuffix = id.match(DATE_SUFFIX)
  const baseId = dateSuffix ? id.slice(0, -dateSuffix[0].length) : id
  const tokens = baseId.split("-")
  const parts: string[] = []
  for (const token of tokens) {
    if (token.toLowerCase() === "gpt") {
      parts.push("GPT")
      continue
    }
    const previous = parts[parts.length - 1]
    if (isNumericToken(token)) {
      if (previous && isNumericToken(previous)) {
        parts[parts.length - 1] = `${previous}.${token}`
      } else {
        parts.push(token)
      }
      continue
    }
    if (/\d/.test(token)) {
      parts.push(token)
      continue
    }
    parts.push(token.charAt(0).toUpperCase() + token.slice(1))
  }
  const label = parts.join(" ") || id
  return dateSuffix ? `${label} (${dateSuffix[1]})` : label
}

export const sortModelsNewestFirst = (
  models: ProviderModel[],
): ProviderModel[] =>
  [...models].sort(
    (a, b) => (b.created ?? 0) - (a.created ?? 0) || a.id.localeCompare(b.id),
  )

const isOpenAiNonChatModel = (id: string): boolean =>
  OPENAI_NON_CHAT_TOKENS.some((token) => id.toLowerCase().includes(token))

export const filterOpenAiChatModels = (
  models: ProviderModel[],
): ProviderModel[] =>
  sortModelsNewestFirst(
    models.filter(
      (m) =>
        !isOpenAiNonChatModel(m.id) && (m.created ?? 0) >= GPT5_LAUNCH_START,
    ),
  )

export const UTILITY_MODEL_TIERS: Record<"anthropic" | "openai", string[]> = {
  anthropic: ["haiku", "sonnet"],
  openai: ["luna", "nano", "mini"],
}

export const resolveUtilityModel = (
  models: ProviderModel[],
  tiers: string[],
): string | null => {
  const byAlias = new Map<string, ProviderModel>()
  for (const model of models) {
    const alias = stripDateSuffix(model.id)
    const existing = byAlias.get(alias)
    if (!existing || (model.created ?? 0) > (existing.created ?? 0)) {
      byAlias.set(alias, model)
    }
  }
  for (const tier of tiers) {
    const matches = sortModelsNewestFirst(
      [...byAlias.values()].filter((m) => m.id.includes(tier)),
    )
    if (matches.length > 0) return matches[0].id
  }
  return null
}
