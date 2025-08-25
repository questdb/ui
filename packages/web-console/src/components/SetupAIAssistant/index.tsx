import React, { useState, useRef } from "react"
import styled from "styled-components"
import { Box, Button, Input, Loader, Select, Checkbox } from "@questdb/react-components"
import { Eye, EyeOff } from "@styled-icons/remix-line"
import { InfoCircle } from "@styled-icons/boxicons-regular"
import { AutoAwesome } from "@styled-icons/material"
import { Tooltip } from "../Tooltip"
import { Text } from "../Text"
import { PopperToggle } from "../PopperToggle"
import { toast } from "../Toast"
import { useLocalStorage, DEFAULT_AI_ASSISTANT_SETTINGS } from "../../providers/LocalStorageProvider"
import { StoreKey } from "../../utils/localStorage/types"
import { testApiKey, isValidApiKeyFormat } from "../../utils/claude"
import { PopperHover } from "../PopperHover"

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

const StyledInput = styled(Input)<{ $hasError?: boolean }>`
  width: 100%;
  height: 3.2rem;
  padding-right: ${({ disabled }) => disabled ? '9rem' : '4rem'};
  background: ${({ theme }) => theme.color.selection};
  border: 1px solid ${({ theme, $hasError }) => $hasError ? theme.color.red : theme.color.gray1};
  border-radius: 0.4rem;
  color: ${({ theme }) => theme.color.foreground};
  font-family: monospace;

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
  height: 3rem;
  transform: translateY(-50%);
  padding: 0 0.75rem;
  right: 0.1rem;
`

const FormLabel = styled.label`
  font-size: 1.6rem;
  font-weight: 600;
`

const HelpText = styled(Text)`
  font-size: 1.3rem;
  line-height: 1.6;
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

type Props = {
  onApiKeyChange?: (hasKey: boolean) => void
}

const MODEL_OPTIONS = [
  { label: "Claude Opus 4.1", value: "claude-opus-4-1" },
  { label: "Claude Opus 4.0", value: "claude-opus-4-0" },
  { label: "Claude Sonnet 4.0", value: "claude-sonnet-4-0" },
  { label: "Claude 3.7 Sonnet (Latest)", value: "claude-3-7-sonnet-latest" },
  { label: "Claude 3.5 Haiku (Latest)", value: "claude-3-5-haiku-latest" },
  { label: "Claude 3.5 Sonnet (Latest)", value: "claude-3-5-sonnet-latest" },
]

export const SetupAIAssistant = ({ onApiKeyChange }: Props) => {
  const { aiAssistantSettings, updateSettings } = useLocalStorage()
  const [active, setActive] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [inputValue, setInputValue] = useState(aiAssistantSettings.apiKey || "")
  const [selectedModel, setSelectedModel] = useState(aiAssistantSettings.model || DEFAULT_AI_ASSISTANT_SETTINGS.model)
  const [grantSchemaAccess, setGrantSchemaAccess] = useState(aiAssistantSettings.grantSchemaAccess !== false)
  const [isValidating, setIsValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleToggle = (newActive: boolean) => {
    if (newActive) {
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 50)
    }
    setActive(newActive)
    if (!newActive) {
      setShowApiKey(false)
      setError(null)
    }
  }

  const validateAndSaveKey = async (key: string) => {
    if (!key) {
      setError("Please enter an API key")
      return false
    }

    if (!isValidApiKeyFormat(key)) {
      setError("Invalid API key format")
      return false
    }

    setIsValidating(true)
    setError(null)

    try {
      const result = await testApiKey(key)
      if (result.valid) {
        const newSettings = {
          apiKey: key,
          model: selectedModel,
          grantSchemaAccess: grantSchemaAccess
        }
        updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, newSettings)
        onApiKeyChange?.(true)
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
      handleToggle(false)
    }
  }

  const handleDelete = () => {
    const newSettings = {
      apiKey: "",
      model: selectedModel,
      grantSchemaAccess: grantSchemaAccess
    }
    updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, newSettings)
    onApiKeyChange?.(false)
    setInputValue("")
    setError(null)
    toast.success("API key removed")
  }

  const handleCancel = () => {
    if (aiAssistantSettings.apiKey) {
      setInputValue(aiAssistantSettings.apiKey)
      setError(null)
    }
    handleToggle(false)
  }

  const handleClearAllSettings = () => {
    updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, DEFAULT_AI_ASSISTANT_SETTINGS)
    onApiKeyChange?.(false)
    setInputValue(DEFAULT_AI_ASSISTANT_SETTINGS.apiKey)
    setSelectedModel(DEFAULT_AI_ASSISTANT_SETTINGS.model)
    setGrantSchemaAccess(DEFAULT_AI_ASSISTANT_SETTINGS.grantSchemaAccess)
    setError(null)
    toast.success("All settings cleared")
  }

  return (
    <PopperToggle
      active={active}
      onToggle={handleToggle}
      trigger={
        <SettingsButton
          skin="secondary"
          prefixIcon={<AutoAwesome size="16px" />}
          data-hook="anthropic-api-settings-button"
          title="Anthropic API Settings"
        >
          Set up AI Assistant       
        </SettingsButton>
      }
      placement="bottom-start"
    >
      <Wrapper>
        <StyledForm onSubmit={handleSave}>
          <FormGroup>
            <FormLabel>
              Anthropic API Key
            </FormLabel>
            
            <InputWrapper>
              <StyledInput
                id="anthropic-api-key-input"
                data-hook="anthropic-api-key-input"
                ref={inputRef}
                type={showApiKey ? "text" : "password"}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value)
                  setError(null)
                }}
                $hasError={!!error}
              />
              <ActionButton
                type="button"
                skin="secondary"
                onClick={() => setShowApiKey(!showApiKey)}
                data-hook="anthropic-api-key-toggle"
              >
                {showApiKey ? <EyeOff size="16px" /> : <Eye size="16px" />}
              </ActionButton>
            </InputWrapper>
            {error && <ErrorText>{error}</ErrorText>}
            
            <HelpText color="gray2">
              Enter your Anthropic API key to enable AI Assistant. 
              Get your API key from{" "}
              <a 
                href="https://console.anthropic.com/settings/keys" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                Anthropic Console
              </a>.
              Your key is stored locally in your browser and never sent to QuestDB servers.
            </HelpText>
          </FormGroup>

          <FormGroup>
            <FormLabel htmlFor="model-select">
              Model
            </FormLabel>
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
            <Box justifyContent="flex-start" align="center" alignSelf="flex-start" gap="0.5rem">
              <StyledCheckbox
                id="grant-schema-access"
                data-hook="grant-schema-access-checkbox"
                checked={grantSchemaAccess}
                onChange={(e) => setGrantSchemaAccess(e.target.checked)}
              />
              <PopperHover
                trigger={
                  <StyledInfoCircle size="15" />
                }
              >
                <Tooltip>
                When enabled, the AI assistant can access your database schema information to provide more accurate suggestions and explanations. Schema information helps the AI understand your table structures, column names, and relationships.
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
                onClick={handleCancel}
                skin="secondary"
                data-hook="anthropic-api-cancel-button"
              >
                Cancel
              </StyledButton>
              <StyledButton
                type="submit"
                disabled={!inputValue || isValidating}
                prefixIcon={isValidating ? <Loader size="14px" /> : undefined}
                data-hook="anthropic-api-save-button"
              >
                {isValidating ? "Validating..." : "Save"}
              </StyledButton>
            </ButtonGroup>
          </Buttons>
        </StyledForm>
      </Wrapper>
    </PopperToggle>
  )
}
