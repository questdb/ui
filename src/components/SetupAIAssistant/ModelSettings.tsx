import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react"
import styled, { useTheme } from "styled-components"
import { Box } from "../Box"
import { Input } from "../Input"
import { Text } from "../Text"
import { LoadingSpinner } from "../LoadingSpinner"
import { Button } from "../Button"
import { IconButton } from "../IconButton"
import { WarningIcon, XIcon } from "@phosphor-icons/react"
import { createProviderByType } from "../../utils/ai/registry"
import type { ProviderType } from "../../utils/ai/settings"
import type { ProviderModel } from "../../utils/ai"
import { ModelPicker } from "./ModelPicker"
import { PermissionsSection } from "../../scenes/Footer/MCPBridgeStatus/PermissionsSection"
import type { Permissions } from "../../utils/tools/permissions"

export const InputSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "1.2rem",
})`
  width: 100%;
`

export const InputLabel = styled(Text)`
  font-size: 1.6rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentSecondary};
`

export const StyledInput = styled(Input)`
  width: 100%;
`

export const HelperText = styled(Text)`
  font-size: 1.3rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const WarningBanner = styled(Box).attrs({
  flexDirection: "row",
  gap: "0.6rem",
  align: "center",
})`
  width: 100%;
  background: ${({ theme }) => theme.color.statusWarningSurface};
  border: 0.1rem solid ${({ theme }) => theme.color.statusWarning};
  border-radius: 0.8rem;
  padding: 0.75rem;
`

const WarningText = styled(Text)`
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.statusWarning};
`

const ModelChipsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
`

const ModelChip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: ${({ theme }) => theme.color.interactionNeutral};
  border-radius: 0.4rem;
  padding: 0.4rem 0.8rem;
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const ChipRemoveButton = styled(IconButton)`
  padding: 0;
  width: 2rem;
  min-width: 2rem;
  height: 2rem;
`

const AddModelRow = styled(Box).attrs({
  gap: "0.8rem",
  align: "center",
})`
  width: 100%;
`

const AddModelButton = styled(Button).attrs({ variant: "secondary" })`
  height: 3rem;
  padding: 0 1.2rem;
  font-size: 1.4rem;
  white-space: nowrap;
`

const ContentSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "2rem",
})`
  padding: 2.4rem;
  width: 100%;
`

const Separator = styled.div`
  height: 0.1rem;
  width: 100%;
  background: ${({ theme }) => theme.color.interactionNeutral};
`

const LoadingContainer = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  width: 100%;
  padding: 4rem 0;
`

export type FetchConfig = {
  providerType: ProviderType
  providerId: string
  apiKey: string
  baseURL: string
}

export type ModelSettingsInitialValues = {
  models?: string[]
  contextWindow?: number
  // Missing keys fall back to: schema=true, read=false, write=false.
  permissions?: Partial<Permissions>
}

export type ModelSettingsData = {
  models: string[]
  contextWindow: number
  permissions: Permissions
}

export type ModelSettingsRef = {
  getValues: () => ModelSettingsData
  validate: () => string | true
}

export type ModelSettingsProps = {
  initialValues?: ModelSettingsInitialValues
  fetchConfig: FetchConfig
  renderSchemaAccess?: boolean
  onLoadingChange?: (loading: boolean) => void
}

async function fetchProviderModels(
  config: FetchConfig,
  contextWindow: number,
): Promise<ProviderModel[] | null> {
  try {
    const provider = createProviderByType(
      config.providerType,
      config.providerId,
      config.apiKey,
      { baseURL: config.baseURL, contextWindow, isCustom: true },
    )
    const models = await provider.listModels()
    return models && models.length > 0 ? models : null
  } catch {
    return null
  }
}

export const ModelSettings = forwardRef<ModelSettingsRef, ModelSettingsProps>(
  (
    { initialValues, fetchConfig, renderSchemaAccess, onLoadingChange },
    ref,
  ) => {
    const theme = useTheme()

    const [fetchedModels, setFetchedModels] = useState<ProviderModel[] | null>(
      null,
    )
    const [selectedModels, setSelectedModels] = useState<string[]>([])
    const [manualModels, setManualModels] = useState<string[]>(
      () => initialValues?.models ?? [],
    )
    const [manualModelInput, setManualModelInput] = useState("")
    const [contextWindowInput, setContextWindowInput] = useState(() =>
      String(initialValues?.contextWindow ?? 200_000),
    )
    const [permissions, setPermissions] = useState<Permissions>(() => ({
      grantSchemaAccess: initialValues?.permissions?.grantSchemaAccess ?? true,
      read: initialValues?.permissions?.read ?? false,
      write: initialValues?.permissions?.write ?? false,
    }))
    const [isLoading, setIsLoading] = useState(true)

    const fetchConfigRef = useRef(fetchConfig)
    fetchConfigRef.current = fetchConfig
    const initialValuesRef = useRef(initialValues)
    initialValuesRef.current = initialValues

    // Fetch models on mount
    useEffect(() => {
      let cancelled = false

      const doFetch = async () => {
        setIsLoading(true)
        const config = fetchConfigRef.current
        const initModels = initialValuesRef.current?.models ?? []
        const initContextWindow =
          initialValuesRef.current?.contextWindow ?? 200_000

        const models = await fetchProviderModels(config, initContextWindow)

        if (cancelled) return

        if (models) {
          setFetchedModels(models)
          setSelectedModels([...initModels])
          setManualModels([])
        } else {
          // Manual mode
          setFetchedModels(null)
          setSelectedModels([])
          setManualModels([...initModels])
        }
        setIsLoading(false)
      }

      void doFetch()
      return () => {
        cancelled = true
      }
    }, [])

    useEffect(() => {
      onLoadingChange?.(isLoading)
    }, [isLoading, onLoadingChange])

    const isAutoMode = fetchedModels !== null

    const handleAddManualModel = useCallback(() => {
      const trimmed = manualModelInput.trim()
      if (!trimmed) return
      setManualModels((prev) =>
        prev.includes(trimmed) ? prev : [...prev, trimmed],
      )
      setManualModelInput("")
    }, [manualModelInput])

    const handleRemoveManualModel = useCallback((model: string) => {
      setManualModels((prev) => prev.filter((m) => m !== model))
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        getValues: () => {
          const pending = manualModelInput.trim()
          let models: string[]

          if (isAutoMode) {
            models =
              pending && !selectedModels.includes(pending)
                ? [...selectedModels, pending]
                : [...selectedModels]
          } else {
            models =
              pending && !manualModels.includes(pending)
                ? [...manualModels, pending]
                : [...manualModels]
          }

          const contextWindow = Number(contextWindowInput) || 0
          return { models, contextWindow, permissions }
        },
        validate: () => {
          const pending = manualModelInput.trim()
          const models = isAutoMode ? selectedModels : manualModels
          const hasModels = models.length > 0 || !!pending
          if (!hasModels) return "Add at least one model"
          const trimmed = contextWindowInput.trim()
          if (!trimmed) return "Context window is required"
          const contextWindow = Number(trimmed)
          if (isNaN(contextWindow) || !Number.isInteger(contextWindow))
            return "Context window must be a valid number"
          if (contextWindow < 100_000)
            return "Context window must be at least 100,000 tokens"
          return true
        },
      }),
      [
        manualModelInput,
        isAutoMode,
        selectedModels,
        manualModels,
        contextWindowInput,
        permissions,
      ],
    )

    if (isLoading) {
      return (
        <ContentSection align="flex-start">
          <LoadingContainer>
            <LoadingSpinner size="3rem" />
          </LoadingContainer>
        </ContentSection>
      )
    }

    return (
      <>
        <ContentSection align="flex-start">
          {!isAutoMode && (
            <WarningBanner data-hook="custom-provider-warning-banner">
              <WarningIcon
                size="16px"
                weight="bold"
                color={theme.color.statusWarning}
              />
              <WarningText>
                Could not fetch models automatically from this provider. Please
                enter model IDs manually.
              </WarningText>
            </WarningBanner>
          )}
          {isAutoMode && (
            <ModelPicker
              listedModels={fetchedModels}
              selectedModels={selectedModels}
              manualInput={manualModelInput}
              dataHookPrefix="custom-provider"
              onSelectionChange={setSelectedModels}
              onManualInputChange={setManualModelInput}
            />
          )}
          {!isAutoMode && (
            <InputSection align="flex-start">
              <InputLabel>Add Models</InputLabel>
              <AddModelRow>
                <StyledInput
                  type="text"
                  data-hook="custom-provider-manual-model-input"
                  value={manualModelInput}
                  onChange={(e) => setManualModelInput(e.target.value)}
                  placeholder="e.g., llama3, gpt-4o, claude-sonnet-4-20250514"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleAddManualModel()
                    }
                  }}
                />
                <AddModelButton
                  type="button"
                  data-hook="custom-provider-add-model-button"
                  onClick={handleAddManualModel}
                  disabled={!manualModelInput.trim()}
                >
                  Add
                </AddModelButton>
              </AddModelRow>
              {manualModels.length > 0 && (
                <ModelChipsContainer>
                  {manualModels.map((model) => (
                    <ModelChip
                      key={model}
                      data-hook="custom-provider-model-chip"
                    >
                      {model}
                      <ChipRemoveButton
                        label={`Remove ${model}`}
                        variant="ghost"
                        data-hook="custom-provider-remove-model"
                        type="button"
                        onClick={() => handleRemoveManualModel(model)}
                      >
                        <XIcon size="12" weight="bold" />
                      </ChipRemoveButton>
                    </ModelChip>
                  ))}
                </ModelChipsContainer>
              )}
            </InputSection>
          )}
          <HelperText>
            AI Assistant uses tools to gather information about QuestDB and your
            database. Make sure to select the models that support tool calling.
          </HelperText>
        </ContentSection>
        <Separator />
        <ContentSection align="flex-start">
          <InputSection align="flex-start">
            <InputLabel>Context Window</InputLabel>
            <StyledInput
              data-hook="custom-provider-context-window-input"
              type="number"
              value={contextWindowInput}
              onChange={(e) => setContextWindowInput(e.target.value)}
            />
            <HelperText>
              Maximum number of tokens the model can process. AI assistant
              requires a minimum of 100,000 tokens.
            </HelperText>
          </InputSection>
        </ContentSection>
        {renderSchemaAccess && (
          <>
            <Separator />
            <ContentSection align="flex-start">
              <PermissionsSection
                value={permissions}
                onChange={setPermissions}
                variant="rich"
              />
            </ContentSection>
          </>
        )}
      </>
    )
  },
)

ModelSettings.displayName = "ModelSettings"
