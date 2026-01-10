import React, { useState, useCallback, useMemo } from "react"
import styled from "styled-components"
import * as RadixDialog from "@radix-ui/react-dialog"
import { Dialog } from "../Dialog"
import { Box } from "../Box"
import { Input } from "../Input"
import { Switch } from "../Switch"
import { Checkbox } from "../Checkbox"
import { Text } from "../Text"
import { Button } from "../Button"
import { LoadingSpinner } from "../LoadingSpinner"
import { Overlay } from "../Overlay"
import { ForwardRef } from "../ForwardRef"
import { Add, Refresh } from "@styled-icons/remix-line"
import {
  discoverModels,
  testCustomProviderConnection,
  type DiscoveredModel,
} from "../../utils/modelDiscovery"
import { generateCustomProviderId } from "../../utils/aiAssistantSettings"
import type {
  CustomProviderSettings,
  CustomModelInfo,
} from "../../providers/LocalStorageProvider/types"

const StyledContent = styled(Dialog.Content).attrs({
  maxwidth: "56rem",
})`
  display: flex;
  flex-direction: column;
  max-height: 85vh;
  overflow: hidden;
`

const ModalContent = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
`

const HeaderSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "1rem",
})`
  padding: 2.4rem;
  width: 100%;
  flex-shrink: 0;
`

const ModalTitle = styled(Dialog.Title)`
  font-size: 2rem;
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
  font-size: 1.3rem;
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
  flex: 1;
  overflow-y: auto;
`

const FieldGroup = styled(Box).attrs({
  flexDirection: "column",
  gap: "0.8rem",
})`
  width: 100%;
`

const FieldLabel = styled(Text)`
  font-size: 1.4rem;
  font-weight: 500;
  color: ${({ theme }) => theme.color.foreground};
`

const FieldDescription = styled(Text)`
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.gray2};
`

const StyledInput = styled(Input)<{ $hasError?: boolean }>`
  width: 100%;
  background: ${({ theme }) => theme.color.background};
  border: 0.1rem solid
    ${({ theme, $hasError }) => ($hasError ? theme.color.red : "#6b7280")};
  border-radius: 0.8rem;
  padding: 1.2rem;
  color: ${({ theme }) => theme.color.foreground};
  font-size: 1.4rem;

  &::placeholder {
    color: ${({ theme }) => theme.color.gray2};
  }
`

const CheckboxRow = styled(Box).attrs({
  gap: "1rem",
  align: "center",
})`
  width: 100%;
`

const CheckboxLabel = styled(Text)`
  font-size: 1.4rem;
  color: ${({ theme }) => theme.color.foreground};
`

const ErrorText = styled(Text)`
  color: ${({ theme }) => theme.color.red};
  font-size: 1.3rem;
`

const SuccessText = styled(Text)`
  color: ${({ theme }) => theme.color.green};
  font-size: 1.3rem;
`

const ModelsSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "1.2rem",
})`
  width: 100%;
  background: rgba(68, 71, 90, 0.3);
  padding: 1.6rem;
  border-radius: 0.8rem;
`

const ModelsSectionHeader = styled(Box).attrs({
  justifyContent: "space-between",
  align: "center",
})`
  width: 100%;
`

const ModelsSectionTitle = styled(Text)`
  font-size: 1.4rem;
  font-weight: 500;
  color: ${({ theme }) => theme.color.foreground};
`

const ModelList = styled(Box).attrs({
  flexDirection: "column",
  gap: "1rem",
})`
  width: 100%;
  max-height: 20rem;
  overflow-y: auto;
`

const ModelItem = styled(Box).attrs({
  justifyContent: "space-between",
  align: "center",
})`
  width: 100%;
  padding: 0.8rem;
  background: ${({ theme }) => theme.color.background};
  border-radius: 0.4rem;
`

const ModelName = styled(Text)`
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.foreground};
`

const AddModelRow = styled(Box).attrs({
  gap: "1rem",
  align: "center",
})`
  width: 100%;
`

const AddModelInput = styled(StyledInput)`
  flex: 1;
`

const IconButton = styled.button`
  background: ${({ theme }) => theme.color.pinkDarker};
  border: none;
  border-radius: 0.4rem;
  padding: 0.8rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.foreground};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.pinkPrimary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const FooterSection = styled(Box).attrs({
  justifyContent: "space-between",
  align: "center",
  gap: "1.6rem",
})`
  padding: 2.4rem;
  width: 100%;
  flex-shrink: 0;
`

const FooterButtons = styled(Box).attrs({
  gap: "1.2rem",
})`
  margin-left: auto;
`

const ActionButton = styled(Button)`
  padding: 1rem 2rem;
  font-size: 1.4rem;
  font-weight: 500;
`

const TestButton = styled(ActionButton)`
  background: transparent;
  border: 0.1rem solid ${({ theme }) => theme.color.pinkDarker};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.pinkDarker};
  }
`

type AddCustomProviderModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (providerId: string, settings: CustomProviderSettings) => void
  editProvider?: { id: string; settings: CustomProviderSettings } | null
}

export const AddCustomProviderModal = ({
  open,
  onOpenChange,
  onSave,
  editProvider,
}: AddCustomProviderModalProps) => {
  const isEditing = !!editProvider

  const [name, setName] = useState(editProvider?.settings.name || "")
  const [baseUrl, setBaseUrl] = useState(editProvider?.settings.baseUrl || "")
  const [apiKey, setApiKey] = useState(editProvider?.settings.apiKey || "")
  const [apiKeyRequired, setApiKeyRequired] = useState(
    editProvider?.settings.apiKeyRequired ?? false,
  )
  const [grantSchemaAccess, setGrantSchemaAccess] = useState(
    editProvider?.settings.grantSchemaAccess ?? true,
  )
  const [availableModels, setAvailableModels] = useState<CustomModelInfo[]>(
    editProvider?.settings.availableModels || [],
  )
  const [enabledModels, setEnabledModels] = useState<string[]>(
    editProvider?.settings.enabledModels || [],
  )

  const [newModelId, setNewModelId] = useState("")
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle")
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const resetForm = useCallback(() => {
    setName("")
    setBaseUrl("")
    setApiKey("")
    setApiKeyRequired(false)
    setGrantSchemaAccess(true)
    setAvailableModels([])
    setEnabledModels([])
    setNewModelId("")
    setConnectionStatus("idle")
    setConnectionError(null)
    setIsDiscovering(false)
    setValidationError(null)
  }, [])

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        resetForm()
      }
      onOpenChange(newOpen)
    },
    [onOpenChange, resetForm],
  )

  const handleTestConnection = useCallback(async () => {
    if (!baseUrl) {
      setConnectionError("Please enter a base URL")
      return
    }

    setConnectionStatus("testing")
    setConnectionError(null)

    const result = await testCustomProviderConnection(
      baseUrl,
      apiKeyRequired ? apiKey : undefined,
    )

    if (result.valid) {
      setConnectionStatus("success")
    } else {
      setConnectionStatus("error")
      setConnectionError(result.error || "Connection failed")
    }
  }, [baseUrl, apiKey, apiKeyRequired])

  const handleDiscoverModels = useCallback(async () => {
    if (!baseUrl) return

    setIsDiscovering(true)
    setConnectionError(null)

    const result = await discoverModels(baseUrl, apiKeyRequired ? apiKey : undefined)

    if (result.success) {
      const newModels: CustomModelInfo[] = result.models.map((m) => ({
        id: m.id,
        name: m.name,
      }))
      setAvailableModels(newModels)
      // Auto-enable first model if none enabled
      if (enabledModels.length === 0 && newModels.length > 0) {
        setEnabledModels([newModels[0].id])
      }
      setConnectionStatus("success")
    } else {
      setConnectionError(result.error)
      setConnectionStatus("error")
    }

    setIsDiscovering(false)
  }, [baseUrl, apiKey, apiKeyRequired, enabledModels.length])

  const handleAddModel = useCallback(() => {
    if (!newModelId.trim()) return

    const trimmedId = newModelId.trim()
    if (availableModels.some((m) => m.id === trimmedId)) {
      return // Already exists
    }

    setAvailableModels((prev) => [...prev, { id: trimmedId, name: trimmedId }])
    setEnabledModels((prev) => [...prev, trimmedId])
    setNewModelId("")
  }, [newModelId, availableModels])

  const handleToggleModel = useCallback((modelId: string) => {
    setEnabledModels((prev) =>
      prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId],
    )
  }, [])

  const handleSave = useCallback(() => {
    // Validate
    if (!name.trim()) {
      setValidationError("Please enter a provider name")
      return
    }
    if (!baseUrl.trim()) {
      setValidationError("Please enter a base URL")
      return
    }
    if (apiKeyRequired && !apiKey.trim()) {
      setValidationError("Please enter an API key")
      return
    }
    if (enabledModels.length === 0) {
      setValidationError("Please enable at least one model")
      return
    }

    const providerId = editProvider?.id || generateCustomProviderId(name)
    const settings: CustomProviderSettings = {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      apiKeyRequired,
      enabledModels,
      availableModels,
      grantSchemaAccess,
    }

    onSave(providerId, settings)
    handleOpenChange(false)
  }, [
    name,
    baseUrl,
    apiKey,
    apiKeyRequired,
    enabledModels,
    availableModels,
    grantSchemaAccess,
    editProvider,
    onSave,
    handleOpenChange,
  ])

  return (
    <RadixDialog.Root open={open} onOpenChange={handleOpenChange}>
      <RadixDialog.Portal>
        <ForwardRef>
          <Overlay primitive={RadixDialog.Overlay} />
        </ForwardRef>
        <StyledContent>
          <ModalContent>
            <HeaderSection>
              <ModalTitle>
                {isEditing ? "Edit Custom Provider" : "Add Custom Provider"}
              </ModalTitle>
              <ModalSubtitle>
                Add any OpenAI-compatible API endpoint (Ollama, Groq, Together
                AI, etc.)
              </ModalSubtitle>
            </HeaderSection>

            <Separator />

            <ContentSection>
              <FieldGroup>
                <FieldLabel>Provider Name</FieldLabel>
                <StyledInput
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Ollama Server"
                />
              </FieldGroup>

              <FieldGroup>
                <FieldLabel>Base URL</FieldLabel>
                <StyledInput
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                />
                <FieldDescription>
                  The OpenAI-compatible API endpoint (usually ends with /v1)
                </FieldDescription>
              </FieldGroup>

              <FieldGroup>
                <CheckboxRow>
                  <Checkbox
                    checked={apiKeyRequired}
                    onChange={(e) => setApiKeyRequired(e.target.checked)}
                  />
                  <CheckboxLabel>API key required</CheckboxLabel>
                </CheckboxRow>
                {apiKeyRequired && (
                  <StyledInput
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter API key"
                  />
                )}
              </FieldGroup>

              <Box gap="1rem">
                <TestButton
                  onClick={handleTestConnection}
                  disabled={!baseUrl || connectionStatus === "testing"}
                >
                  {connectionStatus === "testing" ? (
                    <Box gap="0.8rem" align="center">
                      <LoadingSpinner size="1.4rem" />
                      Testing...
                    </Box>
                  ) : (
                    "Test Connection"
                  )}
                </TestButton>
                <TestButton
                  onClick={handleDiscoverModels}
                  disabled={!baseUrl || isDiscovering}
                >
                  {isDiscovering ? (
                    <Box gap="0.8rem" align="center">
                      <LoadingSpinner size="1.4rem" />
                      Discovering...
                    </Box>
                  ) : (
                    <Box gap="0.5rem" align="center">
                      <Refresh size="1.4rem" />
                      Discover Models
                    </Box>
                  )}
                </TestButton>
              </Box>

              {connectionStatus === "success" && (
                <SuccessText>Connection successful</SuccessText>
              )}
              {connectionError && <ErrorText>{connectionError}</ErrorText>}

              <ModelsSection>
                <ModelsSectionHeader>
                  <ModelsSectionTitle>
                    Models ({availableModels.length})
                  </ModelsSectionTitle>
                </ModelsSectionHeader>

                {availableModels.length > 0 ? (
                  <ModelList>
                    {availableModels.map((model) => (
                      <ModelItem key={model.id}>
                        <ModelName>{model.name}</ModelName>
                        <Switch
                          checked={enabledModels.includes(model.id)}
                          onChange={() => handleToggleModel(model.id)}
                        />
                      </ModelItem>
                    ))}
                  </ModelList>
                ) : (
                  <FieldDescription>
                    No models yet. Use &quot;Discover Models&quot; or add
                    manually below.
                  </FieldDescription>
                )}

                <AddModelRow>
                  <AddModelInput
                    value={newModelId}
                    onChange={(e) => setNewModelId(e.target.value)}
                    placeholder="Add model ID manually (e.g., llama3.2)"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleAddModel()
                      }
                    }}
                  />
                  <IconButton onClick={handleAddModel} disabled={!newModelId.trim()}>
                    <Add size="1.6rem" />
                  </IconButton>
                </AddModelRow>
              </ModelsSection>

              <FieldGroup>
                <CheckboxRow>
                  <Checkbox
                    checked={grantSchemaAccess}
                    onChange={(e) => setGrantSchemaAccess(e.target.checked)}
                  />
                  <CheckboxLabel>Grant schema access</CheckboxLabel>
                </CheckboxRow>
                <FieldDescription>
                  Allow the AI to access your database schema for better query
                  suggestions
                </FieldDescription>
              </FieldGroup>

              {validationError && <ErrorText>{validationError}</ErrorText>}
            </ContentSection>

            <Separator />

            <FooterSection>
              <FooterButtons>
                <ActionButton
                  skin="transparent"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel
                </ActionButton>
                <ActionButton skin="primary" onClick={handleSave}>
                  {isEditing ? "Save Changes" : "Add Provider"}
                </ActionButton>
              </FooterButtons>
            </FooterSection>
          </ModalContent>
        </StyledContent>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
