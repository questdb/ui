import {
  AI_MODEL_VALUE_FORMAT,
  type AiAssistantSettings,
  type CustomProviderDefinition,
} from "../../providers/LocalStorageProvider/types"
import { StoreKey } from "./types"

type StorageAccess = Pick<Storage, "getItem" | "setItem">

const BUILTIN_PROVIDER_IDS = ["anthropic", "openai"] as const
const LEGACY_REASONING_VARIANT = /@reasoning=(high|medium|low)$/

const makeModelValue = (providerId: string, modelId: string): string =>
  `${providerId}:${modelId}`

const stripModelNamespace = (value: string, providerId: string): string => {
  const prefix = `${providerId}:`
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

const collapseLegacyVariant = (modelId: string): string =>
  modelId.replace(LEGACY_REASONING_VARIANT, "")

const isBuiltinProvider = (providerId: string): boolean =>
  BUILTIN_PROVIDER_IDS.some((candidate) => candidate === providerId)

const selectedProviderFromLegacySettings = (
  settings: AiAssistantSettings,
): { providerId: string; modelId: string } | null => {
  const selectedModel = settings.selectedModel
  if (!selectedModel) return null

  const separatorIndex = selectedModel.indexOf(":")
  const prefix =
    separatorIndex === -1 ? null : selectedModel.slice(0, separatorIndex)
  if (prefix && Object.hasOwn(settings.customProviders ?? {}, prefix)) {
    return {
      providerId: prefix,
      modelId: selectedModel.slice(separatorIndex + 1),
    }
  }

  const providerId = BUILTIN_PROVIDER_IDS.find((candidate) =>
    settings.providers[candidate]?.enabledModels?.includes(selectedModel),
  )
  return providerId ? { providerId, modelId: selectedModel } : null
}

const getEnabledModels = (settings: AiAssistantSettings): string[] => {
  const providerIds = [
    ...BUILTIN_PROVIDER_IDS,
    ...Object.keys(settings.customProviders ?? {}),
  ]
  return providerIds.flatMap((providerId) => {
    const enabledModels = settings.providers[providerId]?.enabledModels
    if (enabledModels) return enabledModels
    return (settings.customProviders?.[providerId]?.models ?? []).map(
      (modelId) => makeModelValue(providerId, modelId),
    )
  })
}

/** Migrates the unversioned local-storage schema to the current schema. */
export const migrateLocalStorage = (
  storage: StorageAccess = localStorage,
): boolean => {
  try {
    const stored = storage.getItem(StoreKey.AI_ASSISTANT_SETTINGS)
    if (!stored) return true

    const settings = JSON.parse(stored) as AiAssistantSettings

    // Only the old, unversioned format is ours to migrate. Never reinterpret a
    // current or future version.
    if (settings.modelValueFormat !== undefined) return true

    const selected = selectedProviderFromLegacySettings(settings)
    const migratedProviders: AiAssistantSettings["providers"] = {
      ...settings.providers,
    }

    for (const [providerId, providerSettings] of Object.entries(
      settings.providers,
    )) {
      if (!providerSettings?.enabledModels) continue

      const builtin = isBuiltinProvider(providerId)
      const customProvider: CustomProviderDefinition | undefined =
        settings.customProviders?.[providerId]
      const validCustomModels = customProvider
        ? new Set(customProvider.models)
        : null
      const rawEnabledModels = providerSettings.enabledModels.map((value) =>
        builtin ? value : stripModelNamespace(value, providerId),
      )
      const selectedHighVariant =
        builtin &&
        selected?.providerId === providerId &&
        selected.modelId.endsWith("@reasoning=high") &&
        rawEnabledModels.includes(selected.modelId)
      const enabledModels = [
        ...new Set(
          rawEnabledModels
            .map((modelId) =>
              builtin ? collapseLegacyVariant(modelId) : modelId,
            )
            .filter((modelId) => builtin || validCustomModels?.has(modelId))
            .map((modelId) => makeModelValue(providerId, modelId)),
        ),
      ]
      const rawUtilityModel = providerSettings.utilityModel
        ? builtin
          ? providerSettings.utilityModel
          : stripModelNamespace(providerSettings.utilityModel, providerId)
        : null

      migratedProviders[providerId] = {
        ...providerSettings,
        enabledModels,
        ...(rawUtilityModel
          ? {
              utilityModel: makeModelValue(
                providerId,
                builtin
                  ? collapseLegacyVariant(rawUtilityModel)
                  : rawUtilityModel,
              ),
            }
          : {}),
        ...(selectedHighVariant ? { reasoningEffort: "high" as const } : {}),
      }
    }

    const migrated: AiAssistantSettings = {
      ...settings,
      modelValueFormat: AI_MODEL_VALUE_FORMAT,
      providers: migratedProviders,
      ...(selected
        ? {
            selectedModel: makeModelValue(
              selected.providerId,
              isBuiltinProvider(selected.providerId)
                ? collapseLegacyVariant(selected.modelId)
                : selected.modelId,
            ),
          }
        : { selectedModel: undefined }),
    }
    const enabledModels = getEnabledModels(migrated)
    if (
      !migrated.selectedModel ||
      !enabledModels.includes(migrated.selectedModel)
    ) {
      migrated.selectedModel = enabledModels[0]
    }

    storage.setItem(StoreKey.AI_ASSISTANT_SETTINGS, JSON.stringify(migrated))
    return true
  } catch {
    // Leave invalid persisted data untouched; the regular reader uses defaults.
    return false
  }
}
