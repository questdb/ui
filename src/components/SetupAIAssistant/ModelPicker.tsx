import React, { useState } from "react"
import styled, { useTheme } from "styled-components"
import { WarningIcon, XIcon } from "@phosphor-icons/react"
import { Box } from "../Box"
import { Button } from "../Button"
import { Checkbox } from "../Checkbox"
import { IconButton } from "../IconButton"
import { Input } from "../Input"
import { Text } from "../Text"
import { TextButton } from "../TextButton"
import type { ProviderModel } from "../../utils/ai"
import { matchesListedModel, sortModelsNewestFirst } from "../../utils/ai"

const PickerSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "1.2rem",
})`
  width: 100%;
`

const HeaderRow = styled(Box).attrs({
  flexDirection: "row",
  gap: "1.2rem",
  align: "center",
})`
  width: 100%;
`

const HeaderLabel = styled(Text)`
  font-size: 1.6rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const SelectAllRow = styled(Box).attrs({
  gap: "2rem",
  align: "center",
})`
  display: inline-flex;
  margin-left: auto;
`

const SelectAllLink = styled(TextButton)`
  font-size: 1.4rem;
`

const ModelListContainer = styled.div`
  max-height: 30rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border: 0.1rem solid ${({ theme }) => theme.color.borderStrong};
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
  color: ${({ theme }) => theme.color.contentPrimary};

  &:hover {
    background: ${({ theme }) => theme.color.interactionNeutral};
  }
`

const ModelIdText = styled(Text)`
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const UnavailableRow = styled(Box).attrs({
  gap: "0.8rem",
  align: "center",
})`
  padding: 0.6rem 0.8rem;
  font-size: 1.4rem;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const UnavailableHint = styled(Text)`
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.statusWarning};
  margin-left: auto;
`

const ShowAllButton = styled(TextButton)`
  font-size: 1.3rem;
  align-self: flex-start;
`

const HelperText = styled(Text)`
  font-size: 1.3rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const AddModelRow = styled(Box).attrs({
  gap: "0.8rem",
  align: "center",
})`
  width: 100%;
`

const AddModelInput = styled(Input)`
  width: 100%;
`

const AddModelButton = styled(Button).attrs({ variant: "secondary" })`
  height: 3rem;
  padding: 0 1.2rem;
  font-size: 1.4rem;
  white-space: nowrap;
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

export type ModelPickerProps = {
  listedModels: ProviderModel[]
  hiddenModels?: ProviderModel[]
  selectedModels: string[]
  unavailableModels?: string[]
  manualInput: string
  dataHookPrefix: string
  labelFor?: (model: ProviderModel) => string
  onSelectionChange: (models: string[]) => void
  onManualInputChange: (value: string) => void
}

export const ModelPicker = ({
  listedModels,
  hiddenModels,
  selectedModels,
  unavailableModels,
  manualInput,
  dataHookPrefix,
  labelFor,
  onSelectionChange,
  onManualInputChange,
}: ModelPickerProps) => {
  const theme = useTheme()
  const [showAll, setShowAll] = useState(false)

  const visibleModels =
    showAll && hiddenModels?.length
      ? sortModelsNewestFirst([...listedModels, ...hiddenModels])
      : listedModels
  const isRowChecked = (rowId: string) =>
    selectedModels.some((selected) => matchesListedModel(selected, rowId))
  const isListedAnywhere = (selected: string) =>
    listedModels.some((m) => matchesListedModel(selected, m.id)) ||
    (hiddenModels?.some((m) => matchesListedModel(selected, m.id)) ?? false)
  const manualModels = selectedModels.filter((m) => !isListedAnywhere(m))

  const handleToggleRow = (rowId: string) => {
    if (isRowChecked(rowId)) {
      onSelectionChange(
        selectedModels.filter((s) => !matchesListedModel(s, rowId)),
      )
    } else {
      onSelectionChange([...selectedModels, rowId])
    }
  }

  const handleSelectAll = () => {
    const unchecked = visibleModels
      .filter((m) => !isRowChecked(m.id))
      .map((m) => m.id)
    onSelectionChange([...selectedModels, ...unchecked])
  }

  const handleDeselectAll = () => {
    onSelectionChange(
      selectedModels.filter(
        (s) => !visibleModels.some((m) => matchesListedModel(s, m.id)),
      ),
    )
  }

  const handleAddManualModel = () => {
    const trimmed = manualInput.trim()
    if (!trimmed) return
    if (!selectedModels.includes(trimmed)) {
      onSelectionChange([...selectedModels, trimmed])
    }
    onManualInputChange("")
  }

  const handleRemoveManualModel = (model: string) => {
    onSelectionChange(selectedModels.filter((m) => m !== model))
  }

  return (
    <>
      <PickerSection align="flex-start">
        <HeaderRow>
          <HeaderLabel>Select Models</HeaderLabel>
          <SelectAllRow>
            <SelectAllLink
              data-hook={`${dataHookPrefix}-select-all`}
              type="button"
              onClick={handleSelectAll}
            >
              Select All
            </SelectAllLink>
            <SelectAllLink
              data-hook={`${dataHookPrefix}-deselect-all`}
              type="button"
              onClick={handleDeselectAll}
            >
              Deselect All
            </SelectAllLink>
          </SelectAllRow>
        </HeaderRow>
        <ModelListContainer>
          {unavailableModels?.map((model) => (
            <UnavailableRow
              key={model}
              data-hook={`${dataHookPrefix}-unavailable-row`}
            >
              <WarningIcon
                size="16px"
                weight="bold"
                color={theme.color.statusWarning}
              />
              {model}
              <UnavailableHint>
                Removed by the provider. Save removes it.
              </UnavailableHint>
            </UnavailableRow>
          ))}
          {visibleModels.map((model) => {
            const label = labelFor ? labelFor(model) : model.id
            return (
              <ModelRow
                key={model.id}
                data-hook={`${dataHookPrefix}-model-row`}
              >
                <Checkbox
                  checked={isRowChecked(model.id)}
                  onChange={() => handleToggleRow(model.id)}
                />
                {label}
                {label !== model.id && <ModelIdText>{model.id}</ModelIdText>}
              </ModelRow>
            )
          })}
        </ModelListContainer>
        {!showAll && !!hiddenModels?.length && (
          <ShowAllButton
            type="button"
            data-hook={`${dataHookPrefix}-show-all`}
            onClick={() => setShowAll(true)}
          >
            Show all models
          </ShowAllButton>
        )}
      </PickerSection>
      <PickerSection align="flex-start">
        <HelperText>Don&apos;t see your model? Add it manually:</HelperText>
        <AddModelRow>
          <AddModelInput
            type="text"
            data-hook={`${dataHookPrefix}-manual-model-input`}
            value={manualInput}
            onChange={(e) => onManualInputChange(e.target.value)}
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
            data-hook={`${dataHookPrefix}-add-model-button`}
            onClick={handleAddManualModel}
            disabled={!manualInput.trim()}
          >
            Add
          </AddModelButton>
        </AddModelRow>
        {manualModels.length > 0 && (
          <ModelChipsContainer>
            {manualModels.map((model) => (
              <ModelChip key={model} data-hook={`${dataHookPrefix}-model-chip`}>
                {model}
                <ChipRemoveButton
                  label={`Remove ${model}`}
                  variant="ghost"
                  data-hook={`${dataHookPrefix}-remove-model`}
                  type="button"
                  onClick={() => handleRemoveManualModel(model)}
                >
                  <XIcon size="12" weight="bold" />
                </ChipRemoveButton>
              </ModelChip>
            ))}
          </ModelChipsContainer>
        )}
      </PickerSection>
    </>
  )
}
