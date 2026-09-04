import { describe, it, expect } from "vitest"
import {
  filterOpenAiChatModels,
  formatModelLabel,
  resolveUtilityModel,
  stripDateSuffix,
  UTILITY_MODEL_TIERS,
} from "./modelCatalog"
import type { ProviderModel } from "./modelCatalog"

const model = (id: string, created?: number): ProviderModel => ({ id, created })

const AUG_2025 = Date.UTC(2025, 7, 7) / 1000
const JUL_2025 = Date.UTC(2025, 6, 1) / 1000

describe("stripDateSuffix", () => {
  it("strips Anthropic and OpenAI date suffixes", () => {
    expect(stripDateSuffix("claude-sonnet-4-5-20250929")).toBe(
      "claude-sonnet-4-5",
    )
    expect(stripDateSuffix("gpt-4.1-2025-04-14")).toBe("gpt-4.1")
    expect(stripDateSuffix("gpt-4-0613")).toBe("gpt-4")
  })

  it("keeps non-date suffixes", () => {
    expect(stripDateSuffix("gpt-3.5-turbo-16k")).toBe("gpt-3.5-turbo-16k")
    expect(stripDateSuffix("claude-sonnet-4-5")).toBe("claude-sonnet-4-5")
  })
})

describe("formatModelLabel", () => {
  it("derives labels from OpenAI ids", () => {
    expect(formatModelLabel("gpt-5-mini")).toBe("GPT 5 Mini")
    expect(formatModelLabel("gpt-5.4")).toBe("GPT 5.4")
    expect(formatModelLabel("gpt-5.6-luna")).toBe("GPT 5.6 Luna")
    expect(formatModelLabel("gpt-4o")).toBe("GPT 4o")
    expect(formatModelLabel("o4-mini")).toBe("o4 Mini")
  })

  it("formats version numbers without provider-specific separators", () => {
    expect(formatModelLabel("gpt-6")).toBe("GPT 6")
    expect(formatModelLabel("gpt-6-7")).toBe("GPT 6.7")
    expect(formatModelLabel("gpt-5.6-7")).toBe("GPT 5.6.7")
    expect(formatModelLabel("gpt-5.6-something")).toBe("GPT 5.6 Something")
    expect(formatModelLabel("something-1.2")).toBe("Something 1.2")
    expect(formatModelLabel("claude-sonnet-4-5")).toBe("Claude Sonnet 4.5")
    expect(formatModelLabel("claude-sonnet-5")).toBe("Claude Sonnet 5")
    expect(formatModelLabel("claude-sonnet-6-7")).toBe("Claude Sonnet 6.7")
    expect(formatModelLabel("claude-sonnet-6.7-something")).toBe(
      "Claude Sonnet 6.7 Something",
    )
    expect(formatModelLabel("claude-sonnet-6-7-something")).toBe(
      "Claude Sonnet 6.7 Something",
    )
  })

  it("preserves date suffixes", () => {
    expect(formatModelLabel("gpt-5.4-20250815")).toBe("GPT 5.4 (20250815)")
    expect(formatModelLabel("claude-opus-4-5-20251101")).toBe(
      "Claude Opus 4.5 (20251101)",
    )
    expect(formatModelLabel("gpt-5.4-nano-2026-03-17")).toBe(
      "GPT 5.4 Nano (2026-03-17)",
    )
  })
})

describe("filterOpenAiChatModels", () => {
  it("drops known non-chat models but keeps dated snapshots", () => {
    // Given a listing with chat models, noise, and dated snapshots
    const listing = [
      model("gpt-5.4", AUG_2025 + 300),
      model("gpt-5.4-2026-03-05", AUG_2025 + 300),
      model("text-embedding-3-small", AUG_2025 + 1),
      model("whisper-1", AUG_2025 + 1),
      model("gpt-4o-mini-tts", AUG_2025 + 1),
      model("gpt-5-chat-latest", AUG_2025 + 200),
      model("gpt-5.3-codex", AUG_2025 + 250),
      model("gpt-5.4-pro", AUG_2025 + 250),
      model("sora-2", AUG_2025 + 250),
      model("davinci-002", AUG_2025 + 1),
    ]
    // When the filter runs
    const kept = filterOpenAiChatModels(listing).map((m) => m.id)
    // Then both the plain chat model and its dated snapshot remain
    expect(kept).toEqual(["gpt-5.4", "gpt-5.4-2026-03-05"])
  })

  it("hides generations older than gpt-5 by default", () => {
    // Given chat models from before and after the gpt-5 launch
    const listing = [
      model("gpt-5", AUG_2025),
      model("gpt-4.1", JUL_2025),
      model("gpt-3.5-turbo", JUL_2025 - 1_000_000),
    ]
    // When the filter runs
    const kept = filterOpenAiChatModels(listing).map((m) => m.id)
    // Then only the current generation stays in the default view
    expect(kept).toEqual(["gpt-5"])
  })

  it("keeps a brand-new generation without any code change", () => {
    const kept = filterOpenAiChatModels([model("gpt-6", AUG_2025 + 500)]).map(
      (m) => m.id,
    )
    expect(kept).toEqual(["gpt-6"])
  })

  it("sorts newest first", () => {
    const kept = filterOpenAiChatModels([
      model("gpt-5", AUG_2025 + 100),
      model("gpt-5.4", AUG_2025 + 300),
      model("gpt-5.2", AUG_2025 + 200),
    ]).map((m) => m.id)
    expect(kept).toEqual(["gpt-5.4", "gpt-5.2", "gpt-5"])
  })
})

describe("resolveUtilityModel", () => {
  it("picks the newest model of the highest-priority tier", () => {
    // Given luna and nano models where nano is newer
    const listing = [
      model("gpt-5.6-luna", 300),
      model("gpt-5.7-nano", 400),
      model("gpt-5.4-mini", 200),
    ]
    // When resolving with OpenAI tiers
    const utility = resolveUtilityModel(listing, UTILITY_MODEL_TIERS.openai)
    // Then priority beats recency
    expect(utility).toBe("gpt-5.6-luna")
  })

  it("falls through to lower tiers when the top tier is absent", () => {
    const listing = [model("gpt-5.4-mini", 200), model("gpt-5.4-nano", 200)]
    expect(resolveUtilityModel(listing, UTILITY_MODEL_TIERS.openai)).toBe(
      "gpt-5.4-nano",
    )
  })

  it("dedupes dated variants per alias and returns the listed id verbatim", () => {
    const listing = [
      model("claude-haiku-4-5-20251001", 100),
      model("claude-haiku-4-6", 200),
      model("claude-sonnet-5", 300),
    ]
    expect(resolveUtilityModel(listing, UTILITY_MODEL_TIERS.anthropic)).toBe(
      "claude-haiku-4-6",
    )
  })

  it("keeps a dated winner's exact listed id", () => {
    const listing = [model("claude-haiku-4-5-20251001", 100)]
    expect(resolveUtilityModel(listing, UTILITY_MODEL_TIERS.anthropic)).toBe(
      "claude-haiku-4-5-20251001",
    )
  })

  it("returns null when no tier matches", () => {
    expect(
      resolveUtilityModel([model("gpt-5.4", 100)], UTILITY_MODEL_TIERS.openai),
    ).toBeNull()
  })
})
