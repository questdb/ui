/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Copyright (c) 2014-2019 Appsicle
 *  Copyright (c) 2019-2022 QuestDB
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 ******************************************************************************/

import React, { useState, useEffect } from "react"
import styled from "styled-components"
import { Box, Button, Input, Loader } from "@questdb/react-components"
import { Eye, EyeOff, Settings } from "@styled-icons/remix-line"
import { Check } from "@styled-icons/bootstrap"
import { Error } from "@styled-icons/boxicons-regular"
import { Text } from "../Text"
import { PopperToggle } from "../PopperToggle"
import { toast } from "../Toast"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { StoreKey } from "../../utils/localStorage/types"
import { testApiKey, isValidApiKeyFormat } from "../../utils/claude"
import { maskApiKey } from "../../utils/localStorage/crypto"

const Wrapper = styled.div`
  position: absolute;
  margin-top: 0.5rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px solid ${({ theme }) => theme.color.gray1};
  border-radius: 0.4rem;
  padding: 2rem;
  width: 42rem;
  z-index: 1000;
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
  padding-right: 4rem;
  background: ${({ theme }) => theme.color.selection};
  border: 1px solid ${({ theme, $hasError }) => $hasError ? theme.color.red : theme.color.gray1};
  border-radius: 0.4rem;
  color: ${({ theme }) => theme.color.foreground};
  font-family: monospace;

  &:focus {
    outline: none;
    border-color: ${({ theme, $hasError }) => $hasError ? theme.color.red : theme.color.cyan};
  }

  &::placeholder {
    color: ${({ theme }) => theme.color.gray2};
    font-family: inherit;
  }
`

const ToggleButton = styled.button`
  position: absolute;
  right: 0.8rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: ${({ theme }) => theme.color.gray2};
  cursor: pointer;
  padding: 0.4rem;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: ${({ theme }) => theme.color.foreground};
  }

  &:focus {
    outline: 1px solid ${({ theme }) => theme.color.cyan};
    border-radius: 0.2rem;
  }
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

const SuccessText = styled(Text)`
  color: ${({ theme }) => theme.color.green};
  font-size: 1.3rem;
`

const Buttons = styled(Box)`
  gap: 1rem;
  justify-content: flex-end;
`

const StyledButton = styled(Button)`
  font-size: 1.4rem;
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.cyan};
  }
`

const StatusIcon = styled.div<{ $status: 'valid' | 'invalid' }>`
  margin-left: 0.5rem;
  display: inline-flex;
  color: ${({ theme, $status }) => $status === 'valid' ? theme.color.green : theme.color.red};
`

const SettingsButton = styled(Button)`
  padding: 0.6rem;
  
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.cyan};
  }
`

type Props = {
  onApiKeyChange?: (hasKey: boolean) => void
}

export const ClaudeApiSettings = ({ onApiKeyChange }: Props) => {
  const { claudeApiKey, updateSettings } = useLocalStorage()
  const [active, setActive] = useState(false)
  const [apiKey, setApiKey] = useState(claudeApiKey || "")
  const [showApiKey, setShowApiKey] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [validationStatus, setValidationStatus] = useState<'idle' | 'valid' | 'invalid'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setApiKey(claudeApiKey || "")
    setValidationStatus(claudeApiKey ? 'valid' : 'idle')
  }, [claudeApiKey])

  const handleToggle = (newActive: boolean) => {
    setActive(newActive)
    if (!newActive) {
      // Reset form when closing
      setApiKey(claudeApiKey || "")
      setShowApiKey(false)
      setValidationStatus(claudeApiKey ? 'valid' : 'idle')
      setError(null)
    }
  }

  const handleTestKey = async () => {
    if (!apiKey) {
      setError("Please enter an API key")
      return
    }

    if (!isValidApiKeyFormat(apiKey)) {
      setError("Invalid API key format")
      setValidationStatus('invalid')
      return
    }

    setIsValidating(true)
    setError(null)

    try {
      const result = await testApiKey(apiKey)
      if (result.valid) {
        setValidationStatus('valid')
        toast.success("API key is valid!")
      } else {
        setValidationStatus('invalid')
        setError(result.error || "Invalid API key")
      }
    } catch (err) {
      setValidationStatus('invalid')
      setError("Failed to validate API key")
    } finally {
      setIsValidating(false)
    }
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()

    if (!apiKey && claudeApiKey) {
      // User is clearing the key
      if (window.confirm("Are you sure you want to remove your Claude API key?")) {
        updateSettings(StoreKey.CLAUDE_API_KEY, "")
        onApiKeyChange?.(false)
        toast.success("API key removed")
        handleToggle(false)
      }
      return
    }

    if (!apiKey) {
      setError("Please enter an API key")
      return
    }

    if (validationStatus !== 'valid') {
      setError("Please validate your API key first")
      return
    }

    updateSettings(StoreKey.CLAUDE_API_KEY, apiKey)
    onApiKeyChange?.(true)
    toast.success("API key saved successfully")
    handleToggle(false)
  }

  const handleCancel = () => {
    handleToggle(false)
  }

  const displayValue = showApiKey ? apiKey : (apiKey ? maskApiKey(apiKey) : "")

  return (
    <PopperToggle
      active={active}
      onToggle={handleToggle}
      trigger={
        <SettingsButton
          skin="secondary"
          size="sm"
          prefixIcon={<Settings size="16px" />}
          data-hook="claude-api-settings-button"
          title="Claude API Settings"
        />
      }
      placement="bottom-end"
    >
      <Wrapper>
        <StyledForm onSubmit={handleSave}>
          <FormGroup>
            <FormLabel htmlFor="claude-api-key-input">
              Claude API Key
              {validationStatus === 'valid' && (
                <StatusIcon $status="valid">
                  <Check size="16px" />
                </StatusIcon>
              )}
              {validationStatus === 'invalid' && (
                <StatusIcon $status="invalid">
                  <Error size="16px" />
                </StatusIcon>
              )}
            </FormLabel>
            <InputWrapper>
              <StyledInput
                id="claude-api-key-input"
                data-hook="claude-api-key-input"
                type={showApiKey ? "text" : "password"}
                value={displayValue}
                onChange={(e) => {
                  if (showApiKey || !apiKey) {
                    setApiKey(e.target.value)
                    setValidationStatus('idle')
                    setError(null)
                  }
                }}
                placeholder="sk-ant-api..."
                $hasError={!!error}
              />
              <ToggleButton
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                data-hook="claude-api-key-toggle"
              >
                {showApiKey ? <EyeOff size="18px" /> : <Eye size="18px" />}
              </ToggleButton>
            </InputWrapper>
            {error && <ErrorText>{error}</ErrorText>}
            {validationStatus === 'valid' && !error && (
              <SuccessText>API key is valid and ready to use</SuccessText>
            )}
            <HelpText color="gray2">
              Enter your Claude API key to enable SQL query explanations. 
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

          <Buttons>
            <StyledButton
              type="button"
              onClick={handleTestKey}
              disabled={!apiKey || isValidating || apiKey === claudeApiKey}
              prefixIcon={isValidating ? <Loader size="14px" /> : undefined}
              skin="secondary"
              data-hook="claude-api-test-button"
            >
              {isValidating ? "Validating..." : "Test Key"}
            </StyledButton>
            <StyledButton
              type="button"
              onClick={handleCancel}
              skin="secondary"
              data-hook="claude-api-cancel-button"
            >
              Cancel
            </StyledButton>
            <StyledButton
              type="submit"
              disabled={(!apiKey && !claudeApiKey) || (apiKey === claudeApiKey)}
              data-hook="claude-api-save-button"
            >
              {!apiKey && claudeApiKey ? "Remove" : "Save"}
            </StyledButton>
          </Buttons>
        </StyledForm>
      </Wrapper>
    </PopperToggle>
  )
}