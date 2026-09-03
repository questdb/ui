import { describe, it, expect } from "vitest"
import {
  computeReasoningModels,
  filterOpenAiChatModels,
  formatModelLabel,
  isReasoningModel,
  matchesListedModel,
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

describe("matchesListedModel", () => {
  it("matches exact ids", () => {
    expect(matchesListedModel("gpt-5.4", "gpt-5.4")).toBe(true)
  })

  it("matches a stored alias against its dated listing id", () => {
    expect(
      matchesListedModel("claude-sonnet-4-5", "claude-sonnet-4-5-20250929"),
    ).toBe(true)
  })

  it("does not match a stored dated id against a different dated id", () => {
    expect(matchesListedModel("gpt-4-0613", "gpt-4-1106")).toBe(false)
  })

  it("does not match unrelated ids", () => {
    expect(matchesListedModel("gpt-5.4", "gpt-5.4-mini")).toBe(false)
  })
})

describe("formatModelLabel", () => {
  it("derives labels from OpenAI ids", () => {
    expect(formatModelLabel("gpt-5-mini")).toBe("GPT-5 Mini")
    expect(formatModelLabel("gpt-5.4")).toBe("GPT-5.4")
    expect(formatModelLabel("gpt-5.6-luna")).toBe("GPT-5.6 Luna")
    expect(formatModelLabel("gpt-4o")).toBe("GPT-4o")
    expect(formatModelLabel("o4-mini")).toBe("o4 Mini")
  })

  it("joins consecutive version numbers with dots", () => {
    expect(formatModelLabel("claude-sonnet-4-5")).toBe("Claude Sonnet 4.5")
  })

  it("drops the date suffix", () => {
    expect(formatModelLabel("claude-opus-4-5-20251101")).toBe("Claude Opus 4.5")
    expect(formatModelLabel("gpt-5.4-nano-2026-03-17")).toBe("GPT-5.4 Nano")
  })
})

describe("filterOpenAiChatModels", () => {
  it("drops known non-chat models and dated snapshots", () => {
    // Given a listing with chat models, noise, and dated snapshots
    const listing = [
      model("gpt-5.4", AUG_2025 + 300),
      model("gpt-5.4-2026-03-05", AUG_2025 + 300),
      model("text-embedding-3-small", AUG_2025 + 1),
      model("whisper-1", AUG_2025 + 1),
      model("gpt-4o-mini-tts", AUG_2025 + 1),
      model("gpt-5-chat-latest", AUG_2025 + 200),
      model("gpt-5.3-codex", AUG_2025 + 250),
      model("sora-2", AUG_2025 + 250),
      model("davinci-002", AUG_2025 + 1),
    ]
    // When the filter runs
    const kept = filterOpenAiChatModels(listing).map((m) => m.id)
    // Then only the plain chat model remains
    expect(kept).toEqual(["gpt-5.4"])
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

  it("collapses dated ids to their alias and keeps the newest", () => {
    const listing = [
      model("claude-haiku-4-5-20251001", 100),
      model("claude-haiku-4-6", 200),
      model("claude-sonnet-5", 300),
    ]
    expect(resolveUtilityModel(listing, UTILITY_MODEL_TIERS.anthropic)).toBe(
      "claude-haiku-4-6",
    )
  })

  it("returns null when no tier matches", () => {
    expect(
      resolveUtilityModel([model("gpt-5.4", 100)], UTILITY_MODEL_TIERS.openai),
    ).toBeNull()
  })
})

describe("reasoning gate", () => {
  it("gates models created on or after the gpt-5 launch", () => {
    const listing = [
      model("gpt-5", AUG_2025),
      model("gpt-4.1", JUL_2025),
      model("gpt-6", AUG_2025 + 1_000_000),
    ]
    expect(computeReasoningModels(listing)).toEqual(["gpt-5", "gpt-6"])
  })

  it("treats models without a timestamp as ungated", () => {
    expect(computeReasoningModels([{ id: "mystery-model" }])).toEqual([])
  })

  it("matches enabled aliases against gated dated ids", () => {
    const gated = ["gpt-5.4-2026-03-05", "gpt-5.4"]
    expect(isReasoningModel("gpt-5.4", gated)).toBe(true)
    expect(isReasoningModel("gpt-4.1", gated)).toBe(false)
    expect(isReasoningModel("gpt-4.1", undefined)).toBe(false)
  })
})
