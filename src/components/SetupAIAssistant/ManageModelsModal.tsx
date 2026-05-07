import React, { useState, useCallback, useRef } from "react"
import styled from "styled-components"
import * as RadixDialog from "@radix-ui/react-dialog"
import { Dialog } from "../Dialog"
import { Box } from "../Box"
import { Text } from "../Text"
import { Button } from "../Button"
import { Overlay } from "../Overlay"
import type { CustomProviderDefinition } from "../../utils/ai/settings"
import { ModelSettings } from "./ModelSettings"
import type { ModelSettingsRef } from "./ModelSettings"

const ModalContent = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 80vh;
  overflow: hidden;
`

const ScrollableContent = styled.div`
  flex: 1;
  overflow-y: auto;
  min-height: 0;
`

const HeaderSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "1.2rem",
  align: "flex-start",
})`
  padding: 2rem 2.4rem;
`

const ModalTitle = styled(Dialog.Title)`
  font-size: 2.4rem;
  font-weight: 600;
  margin: 0;
  padding: 0;
  color: ${({ theme }) => theme.color.foreground};
  border: 0;
`

const ModalSubtitle = styled(RadixDialog.Description)`
  font-size: 1.4rem;
  color: ${({ theme }) => theme.color.gray2};
  margin: 0;
`

const Separator = styled.div`
  height: 0.1rem;
  width: 100%;
  background: ${({ theme }) => theme.color.selection};
`

const FooterSection = styled(Box).attrs({
  justifyContent: "flex-end",
  align: "center",
  gap: "1.2rem",
})`
  padding: 2rem 2.4rem;
  width: 100%;
`

const FooterButton = styled(Button)`
  padding: 1.1rem 1.2rem;
  font-size: 1.4rem;
  font-weight: 500;
  height: 4rem;
  min-width: 12rem;
`

const ErrorText = styled(Text)`
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.red};
`

type ManageModelsModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  providerId: string
  definition: CustomProviderDefinition
  onSave: (providerId: string, definition: CustomProviderDefinition) => void
}

export const ManageModelsModal = ({
  open,
  onOpenChange,
  providerId,
  definition,
  onSave,
}: ManageModelsModalProps) => {
  const [error, setError] = useState<string | null>(null)
  const [modelsLoading, setModelsLoading] = useState(true)
  const modelSettingsRef = useRef<ModelSettingsRef>(null)

  const handleSave = useCallback(() => {
    setError(null)
    const result = modelSettingsRef.current?.validate()
    if (typeof result === "string") {
      setError(result)
      return
    }
    const values = modelSettingsRef.current?.getValues()
    if (!values) return
    onSave(providerId, {
      ...definition,
      models: values.models,
      contextWindow: values.contextWindow,
    })
    onOpenChange(false)
  }, [definition, providerId, onSave, onOpenChange])

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <Overlay primitive={RadixDialog.Overlay} />
        <Dialog.Content maxwidth="72rem">
          <ModalContent>
            <HeaderSection>
              <ModalTitle>Manage Models</ModalTitle>
              <ModalSubtitle>
                Add or remove models and update the context window for{" "}
                {definition.name}.
              </ModalSubtitle>
            </HeaderSection>
            <Separator />
            <ScrollableContent>
              {open && (
                <ModelSettings
                  ref={modelSettingsRef}
                  fetchConfig={{
                    providerType: definition.type,
                    providerId,
                    apiKey: definition.apiKey || "",
                    baseURL: definition.baseURL,
                  }}
                  initialValues={{
                    models: definition.models,
                    contextWindow: definition.contextWindow,
                    grantSchemaAccess: definition.grantSchemaAccess,
                  }}
                  providerName={definition.name}
                  onLoadingChange={setModelsLoading}
                />
              )}
            </ScrollableContent>
            <Separator />
            <FooterSection>
              {error && <ErrorText>{error}</ErrorText>}
              <FooterButton
                skin="secondary"
                data-hook="manage-models-cancel"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </FooterButton>
              <FooterButton
                skin="primary"
                data-hook="manage-models-save"
                onClick={handleSave}
                disabled={modelsLoading}
              >
                Save
              </FooterButton>
            </FooterSection>
          </ModalContent>
        </Dialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
