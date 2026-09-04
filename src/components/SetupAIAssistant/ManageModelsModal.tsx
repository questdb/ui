import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react"
import styled from "styled-components"
import * as RadixDialog from "@radix-ui/react-dialog"
import { Dialog } from "../Dialog"
import { Box } from "../Box"
import { Text } from "../Text"
import { ValidationNotice } from "../ValidationNotice"
import { Button } from "../Button"
import { LoadingSpinner } from "../LoadingSpinner"
import { Overlay } from "../Overlay"
import type { CustomProviderDefinition, ProviderModel } from "../../utils/ai"
import {
  BUILTIN_PROVIDERS,
  buildListingMetadata,
  filterOpenAiChatModels,
  formatModelLabel,
  getProviderName,
  sortModelsNewestFirst,
} from "../../utils/ai"
import { createProviderByType } from "../../utils/ai/registry"
import { ModelSettings } from "./ModelSettings"
import type { ModelSettingsRef } from "./ModelSettings"
import { ModelPicker } from "./ModelPicker"

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
  color: ${({ theme }) => theme.color.contentPrimary};
  border: 0;
`

const ModalSubtitle = styled(RadixDialog.Description)`
  font-size: 1.4rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  margin: 0;
`

const Separator = styled.div`
  height: 0.1rem;
  width: 100%;
  background: ${({ theme }) => theme.color.interactionNeutral};
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
  color: ${({ theme }) => theme.color.statusDanger};
`

const ContentSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "2rem",
})`
  padding: 2.4rem;
  width: 100%;
`

const LoadingContainer = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  width: 100%;
  padding: 4rem 0;
`

export type BuiltinModelsResult = {
  enabledModels: string[]
  modelLabels: Record<string, string>
  utilityModel?: string
}

type BuiltinModelsRef = {
  getResult: () => BuiltinModelsResult | null
  validate: () => string | true
}

type BuiltinModelsContentProps = {
  providerId: string
  apiKey: string
  enabledModels: string[]
  initialListing?: ProviderModel[]
  onLoadingChange: (loading: boolean) => void
  onFetchFailedChange: (failed: boolean) => void
}

const BuiltinModelsContent = forwardRef<
  BuiltinModelsRef,
  BuiltinModelsContentProps
>(
  (
    {
      providerId,
      apiKey,
      enabledModels,
      initialListing,
      onLoadingChange,
      onFetchFailedChange,
    },
    ref,
  ) => {
    const [listing, setListing] = useState<ProviderModel[] | null>(
      initialListing ?? null,
    )
    const [fetchError, setFetchError] = useState<string | null>(null)
    const [selectedModels, setSelectedModels] = useState<string[]>(
      initialListing ? enabledModels : [],
    )
    const [manualInput, setManualInput] = useState("")
    const [isLoading, setIsLoading] = useState(!initialListing)

    const isOpenAi = BUILTIN_PROVIDERS[providerId]?.type === "openai"
    const pickerModels = listing
      ? isOpenAi
        ? filterOpenAiChatModels(listing)
        : sortModelsNewestFirst(listing)
      : []

    const selectionWithPending = () => {
      const pending = manualInput.trim()
      return pending && !selectedModels.includes(pending)
        ? [...selectedModels, pending]
        : [...selectedModels]
    }

    useImperativeHandle(
      ref,
      () => ({
        getResult: () => {
          if (!listing) return null
          const models = selectionWithPending()
          return {
            enabledModels: models,
            ...buildListingMetadata(providerId, listing, models),
          }
        },
        validate: () => {
          if (!listing) return "Could not fetch models from the provider"
          if (selectionWithPending().length === 0)
            return "Enable at least one model"
          return true
        },
      }),
      [listing, selectedModels, manualInput, providerId],
    )

    useEffect(() => {
      let cancelled = false

      const doFetch = async () => {
        if (initialListing) {
          onFetchFailedChange(false)
          onLoadingChange(false)
          return
        }
        onFetchFailedChange(false)
        onLoadingChange(true)
        const provider = createProviderByType(
          BUILTIN_PROVIDERS[providerId].type,
          providerId,
          apiKey,
        )
        try {
          const models = await provider.listModels()
          if (cancelled) return
          setListing(models)
          setSelectedModels(enabledModels)
        } catch (error) {
          if (cancelled) return
          const classified = provider.classifyError(error, () => {})
          setFetchError(
            classified.type === "rate_limit"
              ? classified.message
              : "Could not fetch models from the provider. Check your API key and connection, then try again.",
          )
          onFetchFailedChange(true)
        } finally {
          if (!cancelled) {
            setIsLoading(false)
            onLoadingChange(false)
          }
        }
      }

      void doFetch()
      return () => {
        cancelled = true
      }
    }, [])

    if (isLoading) {
      return (
        <ContentSection>
          <LoadingContainer role="status" aria-busy aria-label="Loading models">
            <LoadingSpinner size="3rem" />
          </LoadingContainer>
        </ContentSection>
      )
    }

    if (fetchError) {
      return (
        <ContentSection align="flex-start" role="alert">
          <ErrorText data-hook="manage-models-fetch-error">
            {fetchError}
          </ErrorText>
        </ContentSection>
      )
    }

    return (
      <ContentSection align="flex-start">
        <ModelPicker
          listedModels={pickerModels}
          selectedModels={selectedModels}
          manualInput={manualInput}
          dataHookPrefix="manage-models"
          labelFor={(model) => model.label ?? formatModelLabel(model.id)}
          onSelectionChange={setSelectedModels}
          onManualInputChange={setManualInput}
        />
      </ContentSection>
    )
  },
)

BuiltinModelsContent.displayName = "BuiltinModelsContent"

type ManageModelsModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  providerId: string
} & (
  | {
      variant: "custom"
      definition: CustomProviderDefinition
      onSave: (providerId: string, definition: CustomProviderDefinition) => void
    }
  | {
      variant: "builtin"
      apiKey: string
      enabledModels: string[]
      initialListing?: ProviderModel[]
      onSave: (providerId: string, result: BuiltinModelsResult) => void
    }
)

export const ManageModelsModal = (props: ManageModelsModalProps) => {
  const { open, onOpenChange, providerId } = props
  const [error, setError] = useState<string | null>(null)
  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelsFetchFailed, setModelsFetchFailed] = useState(false)
  const modelSettingsRef = useRef<ModelSettingsRef>(null)
  const builtinModelsRef = useRef<BuiltinModelsRef>(null)

  const providerName =
    props.variant === "custom"
      ? props.definition.name
      : getProviderName(providerId)

  const handleSave = useCallback(() => {
    setError(null)
    if (props.variant === "custom") {
      const result = modelSettingsRef.current?.validate()
      if (typeof result === "string") {
        setError(result)
        return
      }
      const values = modelSettingsRef.current?.getValues()
      if (!values) return
      props.onSave(providerId, {
        ...props.definition,
        models: values.models,
        contextWindow: values.contextWindow,
      })
    } else {
      const result = builtinModelsRef.current?.validate()
      if (typeof result === "string") {
        setError(result)
        return
      }
      const values = builtinModelsRef.current?.getResult()
      if (!values) return
      props.onSave(providerId, values)
    }
    onOpenChange(false)
  }, [props, providerId, onOpenChange])

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <Overlay primitive={RadixDialog.Overlay} />
        <Dialog.Content maxwidth="72rem">
          <ModalContent>
            <HeaderSection>
              <ModalTitle>Manage Models</ModalTitle>
              <ModalSubtitle>
                {props.variant === "custom"
                  ? `Add or remove models and update the context window for ${providerName}.`
                  : `Enable the ${providerName} models you want to use.`}
              </ModalSubtitle>
            </HeaderSection>
            <Separator />
            <ScrollableContent>
              {open && props.variant === "custom" && (
                <ModelSettings
                  ref={modelSettingsRef}
                  fetchConfig={{
                    providerType: props.definition.type,
                    providerId,
                    apiKey: props.definition.apiKey || "",
                    baseURL: props.definition.baseURL,
                  }}
                  initialValues={{
                    models: props.definition.models,
                    contextWindow: props.definition.contextWindow,
                    permissions: {
                      grantSchemaAccess: props.definition.grantSchemaAccess,
                      read: props.definition.read,
                      write: props.definition.write,
                    },
                  }}
                  onLoadingChange={setModelsLoading}
                />
              )}
              {open && props.variant === "builtin" && (
                <BuiltinModelsContent
                  ref={builtinModelsRef}
                  providerId={providerId}
                  apiKey={props.apiKey}
                  enabledModels={props.enabledModels}
                  initialListing={props.initialListing}
                  onLoadingChange={setModelsLoading}
                  onFetchFailedChange={setModelsFetchFailed}
                />
              )}
            </ScrollableContent>
            {error ? (
              <ValidationNotice dataHook="manage-models-error">
                {error}
              </ValidationNotice>
            ) : (
              <Separator />
            )}
            <FooterSection>
              <FooterButton
                variant="secondary"
                data-hook="manage-models-cancel"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </FooterButton>
              <FooterButton
                variant="primary"
                data-hook="manage-models-save"
                onClick={handleSave}
                disabled={modelsLoading || modelsFetchFailed}
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
