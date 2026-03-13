import React, { useState, useMemo, useCallback, useRef } from "react"
import styled from "styled-components"
import { MultiStepModal } from "../MultiStepModal"
import type { Step } from "../MultiStepModal"
import { useModalNavigation } from "../MultiStepModal"
import { Box } from "../Box"
import { Dialog } from "../Dialog"
import type {
  ProviderType,
  CustomProviderDefinition,
} from "../../utils/ai/settings"
import { Select } from "../Select"
import { toast } from "../Toast"
import {
  ModelSettings,
  InputSection,
  InputLabel,
  StyledInput,
  HelperText,
} from "./ModelSettings"
import type { ModelSettingsRef } from "./ModelSettings"

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
            data-hook="custom-provider-name-input"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g., OpenRouter, Ollama"
          />
        </InputSection>
        <InputSection align="flex-start">
          <InputLabel>Provider Type</InputLabel>
          <StyledSelect
            data-hook="custom-provider-type-select"
            name="providerType"
            value={providerType}
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
            data-hook="custom-provider-base-url-input"
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
            data-hook="custom-provider-api-key-input"
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

const StepTwoHeader = () => {
  const navigation = useModalNavigation()

  return (
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
  )
}

export type CustomProviderModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (providerId: string, provider: CustomProviderDefinition) => void
  existingProviderNames: string[]
}

export const CustomProviderModal = ({
  open,
  onOpenChange,
  onSave,
  existingProviderNames,
}: CustomProviderModalProps) => {
  const [name, setName] = useState("")
  const [providerType, setProviderType] = useState<ProviderType>(
    "openai-chat-completions",
  )
  const [baseURL, setBaseURL] = useState("")
  const [apiKey, setApiKey] = useState("")

  const modelSettingsRef = useRef<ModelSettingsRef>(null)

  const connectionValidate = useCallback((): string | boolean => {
    if (!name.trim()) return "Provider name is required"
    if (!baseURL.trim()) return "Base URL is required"
    if (!baseURL.startsWith("http://") && !baseURL.startsWith("https://"))
      return "Base URL must start with http:// or https://"

    const normalizedName = name.trim().toLowerCase()
    if (existingProviderNames.some((n) => n.toLowerCase() === normalizedName))
      return "A provider with the same name already exists"

    return true
  }, [name, baseURL, existingProviderNames])

  const modelsValidate = useCallback((): string | boolean => {
    return modelSettingsRef.current?.validate() ?? "Not ready"
  }, [])

  const handleComplete = useCallback(() => {
    const providerId = crypto.randomUUID()
    const values = modelSettingsRef.current?.getValues()
    if (!values) return

    const definition: CustomProviderDefinition = {
      type: providerType,
      name: name.trim(),
      baseURL: baseURL.trim(),
      apiKey: apiKey || undefined,
      contextWindow: values.contextWindow,
      models: values.models,
      grantSchemaAccess: values.grantSchemaAccess,
    }

    onSave(providerId, definition)
    toast.success(`Added custom provider ${name.trim()}.`)
  }, [name, providerType, baseURL, apiKey, onSave])

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

    return [
      connectionStep,
      {
        id: "model-settings",
        title: "Add Custom Provider",
        stepName: "Models & Settings",
        content: (
          <ModalContent>
            <StepTwoHeader />
            <Separator />
            <ModelSettings
              key={`${providerType}-${baseURL}-${apiKey}`}
              ref={modelSettingsRef}
              fetchConfig={{
                providerType,
                providerId: "custom-provider-setup",
                apiKey: apiKey || "",
                baseURL,
              }}
              renderSchemaAccess
              providerName={name || "this provider"}
            />
          </ModalContent>
        ),
        validate: modelsValidate,
      },
    ]
  }, [name, providerType, baseURL, apiKey, connectionValidate, modelsValidate])

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
