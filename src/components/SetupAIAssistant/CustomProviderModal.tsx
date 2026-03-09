import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import styled, { useTheme } from "styled-components"
import { MultiStepModal } from "../MultiStepModal"
import type { Step } from "../MultiStepModal"
import { useModalNavigation } from "../MultiStepModal"
import { Box } from "../Box"
import { Input } from "../Input"
import { Checkbox } from "../Checkbox"
import { Text } from "../Text"
import { Dialog } from "../Dialog"
import { createProviderByType } from "../../utils/ai/registry"
import type {
  ProviderType,
  CustomProviderDefinition,
} from "../../utils/ai/settings"
import { Select } from "../Select"
import { WarningIcon, XIcon } from "@phosphor-icons/react"

const ModalContent = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`

const HeaderSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "1.6rem",
})`
  padding: 2.4rem;
  padding-top: 0;
  width: 100%;
`

const HeaderTitleRow = styled(Box).attrs({
  justifyContent: "space-between",
  align: "flex-start",
  gap: "1rem",
})`
  width: 100%;
`

const HeaderText = styled(Box).attrs({
  flexDirection: "column",
  gap: "1.2rem",
  align: "flex-start",
})`
  flex: 1;
`

const ModalTitle = styled(Dialog.Title)`
  font-size: 2.4rem;
  font-weight: 600;
  margin: 0;
  padding: 0;
  color: ${({ theme }) => theme.color.foreground};
  border: 0;
`

const ModalSubtitle = styled(Dialog.Description)`
  color: ${({ theme }) => theme.color.gray2};
  margin: 0;
  padding: 0;
`

const StyledCloseButton = styled.button`
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.gray1};
  border-radius: 0.4rem;
  flex-shrink: 0;
  width: 2.2rem;
  height: 2.2rem;

  &:hover {
    color: ${({ theme }) => theme.color.foreground};
  }
`

const Separator = styled.div`
  height: 0.1rem;
  width: 100%;
  background: ${({ theme }) => theme.color.selection};
`

const ContentSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "2rem",
})`
  padding: 2.4rem;
  width: 100%;
`

const InputSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "1.2rem",
})`
  width: 100%;
`

const InputLabel = styled(Text)`
  font-size: 1.6rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.gray2};
`

const StyledInput = styled(Input)<{ $hasError?: boolean }>`
  width: 100%;
  background: #262833;
  border: 0.1rem solid
    ${({ theme, $hasError }) => ($hasError ? theme.color.red : "#6b7280")};
  border-radius: 0.8rem;
  font-size: 1.4rem;
  min-height: 3rem;

  &::placeholder {
    color: ${({ theme }) => theme.color.gray2};
    font-family: inherit;
  }
`

const PasswordInput = styled(StyledInput)`
  text-security: disc;
  -webkit-text-security: disc;
  -moz-text-security: disc;
`

const StyledSelect = styled(Select)`
  width: 100%;
  background: #262833;
  color: ${({ theme }) => theme.color.foreground};
  border: 0.1rem solid #6b7280;
  border-radius: 0.8rem;
  min-height: 3.2rem;
  padding: 0 0.75rem;
  cursor: pointer;

  &:focus {
    border-color: ${({ theme }) => theme.color.pink};
    outline: none;
  }

  option {
    background: ${({ theme }) => theme.color.backgroundDarker};
    color: ${({ theme }) => theme.color.foreground};
  }
`

const HelperText = styled(Text)`
  font-size: 1.3rem;
  font-weight: 300;
  color: ${({ theme }) => theme.color.gray2};
`

const WarningBanner = styled(Box).attrs({
  flexDirection: "row",
  gap: "0.6rem",
  align: "center",
})`
  width: 100%;
  background: rgba(255, 165, 0, 0.08);
  border: 0.1rem solid ${({ theme }) => theme.color.orange};
  border-radius: 0.8rem;
  padding: 0.75rem;
`

const WarningText = styled(Text)`
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.orange};
`

const ModelListContainer = styled.div`
  max-height: 30rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border: 0.1rem solid #6b7280;
  border-radius: 0.4rem;
  width: 100%;
`

const ModelRow = styled.label`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.6rem 0.8rem;
  cursor: pointer;
  font-size: 1.4rem;
  color: ${({ theme }) => theme.color.foreground};

  &:hover {
    background: ${({ theme }) => theme.color.selection};
  }
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
  background: ${({ theme }) => theme.color.selection};
  border-radius: 0.4rem;
  padding: 0.4rem 0.8rem;
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.foreground};
`

const ChipRemoveButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  color: ${({ theme }) => theme.color.gray2};

  &:hover {
    color: ${({ theme }) => theme.color.foreground};
  }
`

const AddModelRow = styled(Box).attrs({
  gap: "0.8rem",
  align: "center",
})`
  width: 100%;
`

const AddModelButton = styled.button`
  height: 3rem;
  border: 0.1rem solid ${({ theme }) => theme.color.pinkDarker};
  background: ${({ theme }) => theme.color.background};
  color: ${({ theme }) => theme.color.foreground};
  border-radius: 0.4rem;
  padding: 0 1.2rem;
  font-size: 1.4rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.pinkDarker};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const SelectAllRow = styled(Box).attrs({
  gap: "2rem",
  align: "center",
})`
  display: inline-flex;
  margin-left: auto;
`

const SelectAllLink = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.color.cyan};
  font-size: 1.4rem;
  padding: 0;

  &:hover {
    text-decoration: underline;
  }
`

const SchemaAccessSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "1.6rem",
  align: "flex-start",
})`
  width: 100%;
`

const SchemaAccessTitle = styled(Text)`
  font-size: 1.6rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.gray2};
  flex: 1;
`

const SchemaCheckboxContainer = styled(Box).attrs({
  gap: "1.5rem",
  align: "flex-start",
})`
  background: rgba(68, 71, 90, 0.56);
  padding: 0.75rem;
  border-radius: 0.4rem;
  width: 100%;
`

const SchemaCheckboxInner = styled(Box).attrs({
  gap: "1.5rem",
  align: "center",
})`
  flex: 1;
  padding: 0.75rem;
  border-radius: 0.5rem;
`

const SchemaCheckboxWrapper = styled.div`
  flex-shrink: 0;
  display: flex;
  align-items: center;
`

const SchemaCheckboxContent = styled(Box).attrs({
  flexDirection: "column",
  gap: "0.6rem",
})`
  flex: 1;
`

const SchemaCheckboxLabel = styled(Text)`
  font-size: 1.4rem;
  font-weight: 500;
  color: ${({ theme }) => theme.color.foreground};
`

const SchemaCheckboxDescription = styled(Text)`
  font-size: 1.3rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.gray2};
`

const SchemaCheckboxDescriptionBold = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.color.foreground};
`

const CloseButton = ({ onClick }: { onClick: () => void }) => (
  <StyledCloseButton onClick={onClick}>
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15 5L5 15M5 5L15 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </StyledCloseButton>
)

const SchemaAccessToggle = ({
  checked,
  onChange,
  providerName,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  providerName: string
}) => (
  <SchemaAccessSection>
    <SchemaAccessTitle>Schema Access</SchemaAccessTitle>
    <SchemaCheckboxContainer>
      <SchemaCheckboxInner>
        <SchemaCheckboxWrapper>
          <Checkbox
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
          />
        </SchemaCheckboxWrapper>
        <SchemaCheckboxContent align="flex-start">
          <SchemaCheckboxLabel>
            Grant schema access to {providerName}
          </SchemaCheckboxLabel>
          <SchemaCheckboxDescription>
            When enabled, the AI assistant can access your database schema
            information to provide more accurate suggestions and explanations.
            Schema information helps the AI understand your table structures,
            column names, and relationships.{" "}
            <SchemaCheckboxDescriptionBold>
              The AI model will not have access to your data.
            </SchemaCheckboxDescriptionBold>
          </SchemaCheckboxDescription>
        </SchemaCheckboxContent>
      </SchemaCheckboxInner>
    </SchemaCheckboxContainer>
  </SchemaAccessSection>
)

type StepOneProps = {
  name: string
  providerType: ProviderType
  baseURL: string
  apiKey: string
  onNameChange: (v: string) => void
  onProviderTypeChange: (v: ProviderType) => void
  onBaseURLChange: (v: string) => void
  onApiKeyChange: (v: string) => void
}

const StepOneContent = ({
  name,
  providerType,
  baseURL,
  apiKey,
  onNameChange,
  onProviderTypeChange,
  onBaseURLChange,
  onApiKeyChange,
}: StepOneProps) => {
  const navigation = useModalNavigation()

  return (
    <ModalContent>
      <HeaderSection>
        <HeaderTitleRow>
          <HeaderText>
            <ModalTitle>Add Custom Provider</ModalTitle>
            <ModalSubtitle>
              Configure a custom AI provider endpoint. Supports
              OpenAI-compatible, Anthropic-compatible, and local providers like
              Ollama.
            </ModalSubtitle>
          </HeaderText>
          <CloseButton onClick={navigation.handleClose} />
        </HeaderTitleRow>
      </HeaderSection>
      <Separator />
      <ContentSection align="flex-start">
        <InputSection align="flex-start">
          <InputLabel>Provider Name</InputLabel>
          <StyledInput
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g., My Ollama, Azure GPT"
          />
        </InputSection>
        <InputSection align="flex-start">
          <InputLabel>Provider Type</InputLabel>
          <StyledSelect
            name="providerType"
            defaultValue={providerType}
            onChange={(e) =>
              onProviderTypeChange(e.target.value as ProviderType)
            }
            options={[
              {
                label: "OpenAI Chat Completions API",
                value: "openai-chat-completions",
              },
              {
                label: "OpenAI Responses API",
                value: "openai",
              },
              {
                label: "Anthropic Messages API",
                value: "anthropic",
              },
            ]}
          />
          <HelperText>
            Most third-party providers and local models use the OpenAI Chat
            Completions format.
          </HelperText>
        </InputSection>
        <InputSection align="flex-start">
          <InputLabel>Base URL</InputLabel>
          <StyledInput
            type="text"
            value={baseURL}
            onChange={(e) => onBaseURLChange(e.target.value)}
            placeholder="e.g., http://localhost:11434/v1"
          />
          <HelperText>
            The base URL of your provider&apos;s API endpoint.
          </HelperText>
        </InputSection>
        <InputSection align="flex-start">
          <InputLabel>API Key</InputLabel>
          <PasswordInput
            type="text"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="Optional for local providers"
          />
          <HelperText>
            Stored locally in your browser. Optional for local providers like
            Ollama.
          </HelperText>
        </InputSection>
      </ContentSection>
    </ModalContent>
  )
}

type StepTwoAutoProps = {
  fetchedModels: string[]
  selectedModels: string[]
  contextWindow: number
  grantSchemaAccess: boolean
  providerName: string
  manualModelInput: string
  onToggleModel: (model: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onContextWindowChange: (v: number) => void
  onSchemaAccessChange: (v: boolean) => void
  onManualModelInputChange: (v: string) => void
  onAddManualModel: () => void
}

const StepTwoAutoContent = ({
  fetchedModels,
  selectedModels,
  contextWindow,
  grantSchemaAccess,
  providerName,
  manualModelInput,
  onToggleModel,
  onSelectAll,
  onDeselectAll,
  onContextWindowChange,
  onSchemaAccessChange,
  onManualModelInputChange,
  onAddManualModel,
}: StepTwoAutoProps) => {
  const navigation = useModalNavigation()

  return (
    <ModalContent>
      <HeaderSection>
        <HeaderTitleRow>
          <HeaderText>
            <ModalTitle>Configure Settings</ModalTitle>
            <ModalSubtitle>
              Configure the settings for your custom provider.
            </ModalSubtitle>
          </HeaderText>
          <CloseButton onClick={navigation.handleClose} />
        </HeaderTitleRow>
      </HeaderSection>
      <Separator />
      <ContentSection align="flex-start">
        <InputSection align="flex-start">
          <Box
            flexDirection="row"
            gap="1.2rem"
            align="center"
            style={{ width: "100%" }}
          >
            <InputLabel>Select Models</InputLabel>
            <SelectAllRow>
              <SelectAllLink type="button" onClick={onSelectAll}>
                Select All
              </SelectAllLink>
              <SelectAllLink type="button" onClick={onDeselectAll}>
                Deselect All
              </SelectAllLink>
            </SelectAllRow>
          </Box>
          <ModelListContainer>
            {fetchedModels.map((model) => (
              <ModelRow key={model}>
                <Checkbox
                  checked={selectedModels.includes(model)}
                  onChange={() => onToggleModel(model)}
                />
                {model}
              </ModelRow>
            ))}
          </ModelListContainer>
        </InputSection>
        <InputSection align="flex-start">
          <HelperText>Don&apos;t see your model? Add it manually:</HelperText>
          <AddModelRow>
            <StyledInput
              type="text"
              value={manualModelInput}
              onChange={(e) => onManualModelInputChange(e.target.value)}
              placeholder="e.g., llama3"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  onAddManualModel()
                }
              }}
            />
            <AddModelButton
              type="button"
              onClick={onAddManualModel}
              disabled={!manualModelInput.trim()}
            >
              Add
            </AddModelButton>
          </AddModelRow>
          {selectedModels.filter((m) => !fetchedModels.includes(m)).length >
            0 && (
            <ModelChipsContainer>
              {selectedModels
                .filter((m) => !fetchedModels.includes(m))
                .map((model) => (
                  <ModelChip key={model}>
                    {model}
                    <ChipRemoveButton
                      type="button"
                      onClick={() => onToggleModel(model)}
                    >
                      <XIcon size="12" weight="bold" />
                    </ChipRemoveButton>
                  </ModelChip>
                ))}
            </ModelChipsContainer>
          )}
        </InputSection>
      </ContentSection>
      <Separator />
      <ContentSection align="flex-start">
        <InputSection align="flex-start">
          <InputLabel>Context Window</InputLabel>
          <StyledInput
            type="number"
            value={contextWindow}
            onChange={(e) => onContextWindowChange(Number(e.target.value))}
            min={1}
          />
          <HelperText>
            Maximum number of tokens the model can process.
          </HelperText>
        </InputSection>
      </ContentSection>
      <ContentSection align="flex-start">
        <SchemaAccessToggle
          checked={grantSchemaAccess}
          onChange={onSchemaAccessChange}
          providerName={providerName}
        />
      </ContentSection>
    </ModalContent>
  )
}

type StepTwoManualProps = {
  manualModels: string[]
  manualModelInput: string
  contextWindow: number
  grantSchemaAccess: boolean
  providerName: string
  onManualModelInputChange: (v: string) => void
  onAddManualModel: () => void
  onRemoveManualModel: (model: string) => void
  onContextWindowChange: (v: number) => void
  onSchemaAccessChange: (v: boolean) => void
}

const StepTwoManualContent = ({
  manualModels,
  manualModelInput,
  contextWindow,
  grantSchemaAccess,
  providerName,
  onManualModelInputChange,
  onAddManualModel,
  onRemoveManualModel,
  onContextWindowChange,
  onSchemaAccessChange,
}: StepTwoManualProps) => {
  const theme = useTheme()
  const navigation = useModalNavigation()

  return (
    <ModalContent>
      <HeaderSection>
        <HeaderTitleRow>
          <HeaderText>
            <ModalTitle>Models &amp; Settings</ModalTitle>
            <ModalSubtitle>
              Configure the models and settings for your custom provider.
            </ModalSubtitle>
          </HeaderText>
          <CloseButton onClick={navigation.handleClose} />
        </HeaderTitleRow>
      </HeaderSection>
      <Separator />
      <ContentSection align="flex-start">
        <WarningBanner>
          <WarningIcon size="16px" weight="bold" color={theme.color.orange} />
          <WarningText>
            Could not fetch models automatically from this provider. Please
            enter model IDs manually.
          </WarningText>
        </WarningBanner>
        <InputSection align="flex-start">
          <InputLabel>Add Models</InputLabel>
          <AddModelRow>
            <StyledInput
              type="text"
              value={manualModelInput}
              onChange={(e) => onManualModelInputChange(e.target.value)}
              placeholder="e.g., llama3, gpt-4o, claude-sonnet-4-20250514"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  onAddManualModel()
                }
              }}
            />
            <AddModelButton
              type="button"
              onClick={onAddManualModel}
              disabled={!manualModelInput.trim()}
            >
              Add
            </AddModelButton>
          </AddModelRow>
          {manualModels.length > 0 && (
            <ModelChipsContainer>
              {manualModels.map((model) => (
                <ModelChip key={model}>
                  {model}
                  <ChipRemoveButton
                    type="button"
                    onClick={() => onRemoveManualModel(model)}
                    title={`Remove ${model}`}
                  >
                    <XIcon size="12" weight="bold" />
                  </ChipRemoveButton>
                </ModelChip>
              ))}
            </ModelChipsContainer>
          )}
        </InputSection>
      </ContentSection>
      <Separator />
      <ContentSection align="flex-start">
        <InputSection align="flex-start">
          <InputLabel>Context Window</InputLabel>
          <StyledInput
            type="number"
            value={contextWindow}
            onChange={(e) => onContextWindowChange(Number(e.target.value))}
            min={1}
          />
          <HelperText>
            Maximum number of tokens the model can process.
          </HelperText>
        </InputSection>
      </ContentSection>
      <Separator />
      <ContentSection align="flex-start">
        <SchemaAccessToggle
          checked={grantSchemaAccess}
          onChange={onSchemaAccessChange}
          providerName={providerName}
        />
      </ContentSection>
    </ModalContent>
  )
}

export type CustomProviderModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (providerId: string, provider: CustomProviderDefinition) => void
  existingProviderIds: string[]
}

const generateProviderId = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "custom-provider"

export const CustomProviderModal = ({
  open,
  onOpenChange,
  onSave,
  existingProviderIds,
}: CustomProviderModalProps) => {
  const [name, setName] = useState("")
  const [providerType, setProviderType] = useState<ProviderType>(
    "openai-chat-completions",
  )
  const [baseURL, setBaseURL] = useState("")
  const [apiKey, setApiKey] = useState("")

  const [contextWindow, setContextWindow] = useState(128_000)
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null)
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [manualModels, setManualModels] = useState<string[]>([])
  const [manualModelInput, setManualModelInput] = useState("")

  const [flowPath, setFlowPath] = useState<"auto" | "manual">("manual")

  const [grantSchemaAccess, setGrantSchemaAccess] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const handleToggleModel = useCallback((model: string) => {
    setSelectedModels((prev) =>
      prev.includes(model) ? prev.filter((m) => m !== model) : [...prev, model],
    )
  }, [])

  const handleSelectAll = useCallback(() => {
    if (fetchedModels) {
      setSelectedModels((prev) => {
        const manual = prev.filter((m) => !fetchedModels.includes(m))
        return [...fetchedModels, ...manual]
      })
    }
  }, [fetchedModels])

  const handleDeselectAll = useCallback(() => {
    setSelectedModels((prev) =>
      fetchedModels ? prev.filter((m) => !fetchedModels.includes(m)) : [],
    )
  }, [fetchedModels])

  const handleAddManualModel = useCallback(() => {
    const trimmed = manualModelInput.trim()
    if (!trimmed) return

    if (flowPath === "auto") {
      setSelectedModels((prev) =>
        prev.includes(trimmed) ? prev : [...prev, trimmed],
      )
    } else {
      setManualModels((prev) =>
        prev.includes(trimmed) ? prev : [...prev, trimmed],
      )
    }
    setManualModelInput("")
  }, [manualModelInput, flowPath])

  const handleRemoveManualModel = useCallback((model: string) => {
    setManualModels((prev) => prev.filter((m) => m !== model))
  }, [])

  const connectionValidate = useCallback(async (): Promise<
    string | boolean
  > => {
    if (!name.trim()) return "Provider name is required"
    if (!baseURL.trim()) return "Base URL is required"
    if (!baseURL.startsWith("http://") && !baseURL.startsWith("https://"))
      return "Base URL must start with http:// or https://"

    const providerId = generateProviderId(name)
    if (existingProviderIds.includes(providerId))
      return `A provider with a similar name already exists`

    // First, check that the URL is reachable with a simple fetch
    try {
      abortControllerRef.current?.abort()
      abortControllerRef.current = new AbortController()

      const normalizedURL = baseURL.replace(/\/+$/, "")
      await fetch(normalizedURL, {
        method: "GET",
        signal: abortControllerRef.current.signal,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "Connection check was cancelled"
      }
      return `Could not connect to ${baseURL}. Please check the URL and make sure the server is running.`
    }

    // URL is reachable — try to fetch models
    try {
      const tempProvider = createProviderByType(
        providerType,
        "temp",
        apiKey || "",
        { baseURL, contextWindow },
      )
      const models = await tempProvider.listModels()
      if (models && models.length > 0) {
        setFetchedModels(models)
        setFlowPath("auto")
      } else {
        setFetchedModels(null)
        setFlowPath("manual")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      return `Could not connect to provider: ${message}`
    }

    return true
  }, [name, baseURL, providerType, apiKey, contextWindow, existingProviderIds])

  const modelsValidate = useCallback((): string | boolean => {
    if (flowPath === "auto") {
      if (selectedModels.length === 0) return "Select at least one model"
    } else {
      if (manualModels.length === 0 && !manualModelInput.trim())
        return "Add at least one model"
    }
    return true
  }, [flowPath, selectedModels, manualModels, manualModelInput])

  const handleComplete = useCallback(() => {
    const providerId = generateProviderId(name)

    // Auto-add any pending manual model input
    const pendingModel = manualModelInput.trim()
    let models: string[]

    if (flowPath === "auto") {
      models =
        pendingModel && !selectedModels.includes(pendingModel)
          ? [...selectedModels, pendingModel]
          : selectedModels
    } else {
      models =
        pendingModel && !manualModels.includes(pendingModel)
          ? [...manualModels, pendingModel]
          : manualModels
    }

    const definition: CustomProviderDefinition = {
      type: providerType,
      name: name.trim(),
      baseURL: baseURL.trim(),
      apiKey: apiKey || undefined,
      contextWindow,
      models,
      grantSchemaAccess,
    }

    onSave(providerId, definition)
  }, [
    name,
    flowPath,
    selectedModels,
    manualModels,
    manualModelInput,
    providerType,
    baseURL,
    apiKey,
    contextWindow,
    grantSchemaAccess,
    onSave,
  ])

  const steps: Step[] = useMemo(() => {
    const connectionStep: Step = {
      id: "connection",
      title: "Add Custom Provider",
      stepName: "Connection",
      content: (
        <StepOneContent
          name={name}
          providerType={providerType}
          baseURL={baseURL}
          apiKey={apiKey}
          onNameChange={setName}
          onProviderTypeChange={setProviderType}
          onBaseURLChange={setBaseURL}
          onApiKeyChange={setApiKey}
        />
      ),
      validate: connectionValidate,
    }

    if (flowPath === "auto" && fetchedModels !== null) {
      return [
        connectionStep,
        {
          id: "select-models",
          title: "Add Custom Provider",
          stepName: "Models & Settings",
          content: (
            <StepTwoAutoContent
              fetchedModels={fetchedModels}
              selectedModels={selectedModels}
              contextWindow={contextWindow}
              grantSchemaAccess={grantSchemaAccess}
              providerName={name || "this provider"}
              manualModelInput={manualModelInput}
              onToggleModel={handleToggleModel}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onContextWindowChange={setContextWindow}
              onSchemaAccessChange={setGrantSchemaAccess}
              onManualModelInputChange={setManualModelInput}
              onAddManualModel={handleAddManualModel}
            />
          ),
          validate: modelsValidate,
        },
      ]
    }

    return [
      connectionStep,
      {
        id: "manual-models",
        title: "Add Custom Provider",
        stepName: "Models & Settings",
        content: (
          <StepTwoManualContent
            manualModels={manualModels}
            manualModelInput={manualModelInput}
            contextWindow={contextWindow}
            grantSchemaAccess={grantSchemaAccess}
            providerName={name || "this provider"}
            onManualModelInputChange={setManualModelInput}
            onAddManualModel={handleAddManualModel}
            onRemoveManualModel={handleRemoveManualModel}
            onContextWindowChange={setContextWindow}
            onSchemaAccessChange={setGrantSchemaAccess}
          />
        ),
        validate: modelsValidate,
      },
    ]
  }, [
    name,
    providerType,
    baseURL,
    apiKey,
    connectionValidate,
    flowPath,
    fetchedModels,
    selectedModels,
    contextWindow,
    grantSchemaAccess,
    manualModelInput,
    handleToggleModel,
    handleSelectAll,
    handleDeselectAll,
    handleAddManualModel,
    modelsValidate,
    manualModels,
    handleRemoveManualModel,
  ])

  const canProceed = useCallback(
    (stepIndex: number): boolean => {
      if (stepIndex === 0) {
        return !!name.trim() && !!baseURL.trim()
      }
      return true
    },
    [name, baseURL],
  )

  return (
    <MultiStepModal
      open={open}
      onOpenChange={onOpenChange}
      steps={steps}
      maxWidth="72rem"
      onComplete={handleComplete}
      canProceed={canProceed}
      completeButtonText="Add Provider"
    />
  )
}
