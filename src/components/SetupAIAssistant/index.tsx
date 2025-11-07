import React, { useEffect, useState, useRef } from "react"
import styled from "styled-components"
import { Box } from "../Box"
import { Button } from "../Button"
import { Input } from "../Input"
import { Loader } from "../Loader"
import { Select } from "../Select"
import { Checkbox } from "../Checkbox"
import { Edit } from "@styled-icons/remix-line"
import { InfoCircle } from "@styled-icons/boxicons-regular"
import { AutoAwesome } from "@styled-icons/material"
import { Tooltip } from "../Tooltip"
import { Text } from "../Text"
import { PopperToggle } from "../PopperToggle"
import { toast } from "../Toast"
import {
  useLocalStorage,
  DEFAULT_AI_ASSISTANT_SETTINGS,
} from "../../providers/LocalStorageProvider"
import { testApiKey } from "../../utils/aiAssistant"
import { PopperHover } from "../PopperHover"
import { StoreKey } from "../../utils/localStorage/types"

const Wrapper = styled.div`
  margin-top: 0.5rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px solid ${({ theme }) => theme.color.gray1};
  border-radius: 0.4rem;
  padding: 2rem;
  width: 42rem;
`

const StyledForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`

const FormGroup = styled(Box).attrs({ flexDirection: "column", gap: "0.8rem" })`
  width: 100%;
  align-items: flex-start;
`

const InputWrapper = styled.div`
  position: relative;
  width: 100%;
`

const StyledInput = styled(Input)<{
  $hasError?: boolean
  $showApiKey?: boolean
}>`
  width: 100%;
  background: ${({ theme }) => theme.color.selection};
  border: 1px solid
    ${({ theme, $hasError }) =>
      $hasError ? theme.color.red : theme.color.gray1};
  border-radius: 0.4rem;
  padding-right: 3.5rem;
  color: ${({ theme }) => theme.color.foreground};
  ${({ $showApiKey }) =>
    $showApiKey &&
    `
    padding-right: 0.75rem;
  `}
  &::placeholder {
    color: ${({ theme }) => theme.color.gray2};
    font-family: inherit;
  }

  &:disabled {
    background: ${({ theme }) => theme.color.selection};
    color: ${({ theme }) => theme.color.foreground};
    cursor: default;
  }
`

const ActionButton = styled(Button)`
  position: absolute;
  top: 50%;
  height: 2.8rem;
  transform: translateY(-50%);
  padding: 0 0.75rem;
  right: 0.1rem;
  border-radius: 0.3rem;
`

const FormLabel = styled.label`
  font-size: 1.6rem;
  font-weight: 600;
`

const ErrorText = styled(Text)`
  color: ${({ theme }) => theme.color.red};
  font-size: 1.3rem;
`

const Buttons = styled(Box)`
  gap: 1rem;
  justify-content: space-between;
  align-items: center;
`

const ButtonGroup = styled(Box)`
  gap: 1rem;
`

const StyledButton = styled(Button)`
  font-size: 1.4rem;
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.cyan};
  }
`

const SettingsButton = styled(Button)`
  padding: 0.6rem;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.cyan};
  }
`

const StyledSelect = styled(Select)`
  width: 100%;
  height: 3.2rem;

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`

const StyledCheckbox = styled(Checkbox)`
  font-size: 1.4rem;
  display: inline;

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`

const CheckboxLabel = styled.label`
  display: inline;
  color: ${({ theme }) => theme.color.foreground};
  font-size: 1.2rem;
  cursor: pointer;
  user-select: none;
`

const StyledInfoCircle = styled(InfoCircle)`
  margin-left: 0.3rem;
`

const DisclaimerText = styled(Text)`
  font-size: 1.2rem;
  line-height: 1.5;
`

export type ModelOption = {
  label: string
  value: string
  provider: "anthropic" | "openai"
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    label: "Claude Sonnet 4.5",
    value: "claude-sonnet-4-5-20250929",
    provider: "anthropic",
  },
  { label: "Claude Opus 4.1", value: "claude-opus-4-1", provider: "anthropic" },
  { label: "Claude Opus 4.0", value: "claude-opus-4-0", provider: "anthropic" },
  {
    label: "Claude Sonnet 4.0",
    value: "claude-sonnet-4-0",
    provider: "anthropic",
  },
  {
    label: "Claude 3.7 Sonnet (Latest)",
    value: "claude-3-7-sonnet-latest",
    provider: "anthropic",
  },
  { label: "GPT 5", value: "gpt-5", provider: "openai" },
  { label: "GPT 5 Mini", value: "gpt-5-mini", provider: "openai" },
  { label: "GPT 5 Nano", value: "gpt-5-nano", provider: "openai" },
  { label: "GPT 4.1", value: "gpt-4.1", provider: "openai" },
]

const providerForModel = (
  model: ModelOption["value"],
): "anthropic" | "openai" => {
  return MODEL_OPTIONS.find((m) => m.value === model)!.provider
}

export const SetupAIAssistant = () => {
  const [active, setActive] = useState(false)

  return (
    <PopperToggle
      active={active}
      onToggle={setActive}
      trigger={
        <SettingsButton
          skin="secondary"
          prefixIcon={<AutoAwesome size="16px" color="#f1fa8c" />}
          data-hook="anthropic-api-settings-button"
          title="Anthropic API Settings"
        >
          Set up AI Assistant
        </SettingsButton>
      }
      placement="bottom-start"
    >
      <AIAssistantSettings setActive={setActive} />
    </PopperToggle>
  )
}

const AIAssistantSettings = ({
  setActive,
}: {
  setActive: (active: boolean) => void
}) => {
  const { aiAssistantSettings, updateSettings } = useLocalStorage()
  const [showApiKey, setShowApiKey] = useState(false)
  const [inputValue, setInputValue] = useState(aiAssistantSettings.apiKey || "")
  const [selectedModel, _setSelectedModel] = useState(
    aiAssistantSettings.model || DEFAULT_AI_ASSISTANT_SETTINGS.model,
  )
  const [grantSchemaAccess, setGrantSchemaAccess] = useState(
    aiAssistantSettings.grantSchemaAccess !== false,
  )
  const [isValidating, setIsValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dirty =
    inputValue !== aiAssistantSettings.apiKey ||
    selectedModel !== aiAssistantSettings.model ||
    grantSchemaAccess !== aiAssistantSettings.grantSchemaAccess

  const setSelectedModel = (model: string) => {
    const oldProvider = providerForModel(selectedModel)
    const newProvider = providerForModel(model)
    if (oldProvider !== newProvider) {
      setInputValue("")
    }
    _setSelectedModel(model)
  }

  const validateAndSaveKey = async (key: string) => {
    if (!key) {
      setError("Please enter an API key")
      return false
    }

    setIsValidating(true)
    setError(null)

    try {
      const result = await testApiKey(key, selectedModel)
      if (result.valid) {
        const newSettings = {
          apiKey: key,
          model: selectedModel,
          grantSchemaAccess,
        }
        updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, newSettings)
        toast.success("Settings saved successfully")
        return true
      } else {
        setError(result.error || "Invalid API key")
        return false
      }
    } catch (err) {
      setError("Failed to validate API key")
      return false
    } finally {
      setIsValidating(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await validateAndSaveKey(inputValue)
    if (result) {
      setActive(false)
    }
  }

  const handleClearAllSettings = () => {
    updateSettings(
      StoreKey.AI_ASSISTANT_SETTINGS,
      DEFAULT_AI_ASSISTANT_SETTINGS,
    )
    setInputValue(DEFAULT_AI_ASSISTANT_SETTINGS.apiKey)
    setSelectedModel(DEFAULT_AI_ASSISTANT_SETTINGS.model)
    setGrantSchemaAccess(DEFAULT_AI_ASSISTANT_SETTINGS.grantSchemaAccess)
    setError(null)
    toast.success("All settings cleared")
  }

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 50)
  }, [])

  return (
    <Wrapper>
      <StyledForm onSubmit={handleSave}>
        <FormGroup>
          <FormLabel htmlFor="model-select">Model</FormLabel>
          <StyledSelect
            id="model-select"
            name="model-select"
            data-hook="anthropic-model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            options={MODEL_OPTIONS}
          />
        </FormGroup>

        <FormGroup>
          <FormLabel>
            {providerForModel(selectedModel) === "anthropic"
              ? "Anthropic API Key"
              : "OpenAI API Key"}
          </FormLabel>

          <InputWrapper>
            {showApiKey || !inputValue ? (
              <StyledInput
                id="ai-provider-api-key-input"
                data-hook="ai-provider-api-key-input"
                ref={inputRef}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value)
                  setError(null)
                }}
                $hasError={!!error}
                $showApiKey
              />
            ) : (
              <>
                <StyledInput
                  id="ai-provider-api-key-input-masked"
                  data-hook="ai-provider-api-key-input-masked"
                  disabled
                  value={inputValue.replace(/./g, "•")}
                  $showApiKey={false}
                />
                <ActionButton
                  type="button"
                  skin="secondary"
                  onClick={() => {
                    setShowApiKey(!showApiKey)
                    if (!showApiKey) {
                      setTimeout(() => {
                        inputRef.current?.focus()
                        inputRef.current?.select()
                      })
                    }
                  }}
                  data-hook="ai-provider-api-key-toggle"
                >
                  <Edit size="16px" />
                </ActionButton>
              </>
            )}
          </InputWrapper>
          {error && <ErrorText>{error}</ErrorText>}

          <DisclaimerText color="gray2">
            {providerForModel(selectedModel) === "anthropic"
              ? "Enter your Anthropic API key to enable AI Assistant."
              : "Enter your OpenAI API key to enable AI Assistant."}
            Get your API key from{" "}
            <a
              href={
                providerForModel(selectedModel) === "anthropic"
                  ? "https://console.anthropic.com/settings/keys"
                  : "https://platform.openai.com/api-keys"
              }
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "inherit", textDecoration: "underline" }}
            >
              {providerForModel(selectedModel) === "anthropic"
                ? "Anthropic"
                : "OpenAI"}
            </a>
            . Your key is stored locally in your browser and never sent to
            QuestDB servers.
          </DisclaimerText>
        </FormGroup>

        <FormGroup>
          <Box
            justifyContent="flex-start"
            align="center"
            alignSelf="flex-start"
            gap="0.5rem"
          >
            <StyledCheckbox
              id="grant-schema-access"
              data-hook="grant-schema-access-checkbox"
              checked={grantSchemaAccess}
              onChange={(e) => setGrantSchemaAccess(e.target.checked)}
            />
            <PopperHover trigger={<StyledInfoCircle size="15" />}>
              <Tooltip>
                When enabled, the AI assistant can access your database schema
                information to provide more accurate suggestions and
                explanations. Schema information helps the AI understand your
                table structures, column names, and relationships.
              </Tooltip>
            </PopperHover>
            <CheckboxLabel
              id="grant-schema-access-label"
              htmlFor="grant-schema-access"
              data-hook="grant-schema-access-label"
            >
              Grant schema access
            </CheckboxLabel>
          </Box>
        </FormGroup>

        <DisclaimerText color="gray2">
          This AI assistant may occasionally produce inaccurate information.
          Please verify important details and review all generated queries
          before execution.
        </DisclaimerText>

        <Buttons>
          <Box>
            {aiAssistantSettings.apiKey && (
              <StyledButton
                type="button"
                onClick={handleClearAllSettings}
                skin="error"
                data-hook="anthropic-api-clear-button"
              >
                Clear all settings
              </StyledButton>
            )}
          </Box>
          <ButtonGroup>
            <StyledButton
              type="button"
              onClick={() => setActive(false)}
              skin="secondary"
              data-hook="anthropic-api-cancel-button"
            >
              Cancel
            </StyledButton>
            <StyledButton
              type="submit"
              disabled={!inputValue || isValidating || !dirty}
              prefixIcon={isValidating ? <Loader size="14px" /> : undefined}
              data-hook="anthropic-api-save-button"
            >
              {isValidating ? "Validating..." : "Save"}
            </StyledButton>
          </ButtonGroup>
        </Buttons>
      </StyledForm>
    </Wrapper>
  )
}
