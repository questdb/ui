import React, { ReactNode, useRef, useState } from "react"
import styled from "styled-components"
import { Dialog } from "../Dialog"
import { Overlay } from "../Overlay"
import { ForwardRef } from "../ForwardRef"
import { Text } from "../Text"
import { Button } from "../Button"
import { Switch } from "../Switch"
import { Input } from "../Input"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import {
  isMaxColumnWidthDraftValid,
  parseMaxColumnWidth,
} from "../../providers/LocalStorageProvider/utils"
import { MAX_COLUMN_WIDTH_BOUNDS } from "../ResultGrid/dimensions"
import { StoreKey } from "../../utils/localStorage/types"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const StyledContent = styled(Dialog.Content).attrs({
  maxwidth: "48rem",
})`
  display: flex;
  flex-direction: column;
`

const Form = styled.form`
  display: contents;
`

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding: 2rem;
`

const ItemRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2rem;
`

const ItemText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`

const ItemControl = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
`

const WidthField = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.4rem;
`

const WidthInputRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
`

const WidthInput = styled(Input)`
  width: 9rem;
  flex: 0 0 auto;
  text-align: right;
`

type SettingRowProps = {
  label: string
  description: string
  controlId: string
  children: ReactNode
}

const settingDescriptionId = (controlId: string) => `${controlId}-description`

const SettingRow = ({
  label,
  description,
  controlId,
  children,
}: SettingRowProps) => (
  <ItemRow>
    <ItemText>
      <Text color="foreground" lineHeight="1" type="label" htmlFor={controlId}>
        {label}
      </Text>
      <div id={settingDescriptionId(controlId)}>
        <Text color="gray2" size="xs">
          {description}
        </Text>
      </div>
    </ItemText>
    <ItemControl>{children}</ItemControl>
  </ItemRow>
)

const RUN_WITH_SELECTION_ID = "editor-settings-run-with-selection"
const MAX_COLUMN_WIDTH_ID = "editor-settings-max-column-width"
const MAX_COLUMN_WIDTH_ERROR_ID = `${MAX_COLUMN_WIDTH_ID}-error`

const EditorSettingsForm = ({ onClose }: { onClose: () => void }) => {
  const { runWithSelection, maxColumnWidth, updateSettings } = useLocalStorage()
  const [runWithSelectionDraft, setRunWithSelectionDraft] =
    useState(runWithSelection)
  const [maxColumnWidthDraft, setMaxColumnWidthDraft] = useState(
    maxColumnWidth === "auto" ? "" : String(maxColumnWidth),
  )
  const [maxColumnWidthError, setMaxColumnWidthError] = useState(false)
  const widthInputRef = useRef<HTMLInputElement>(null)

  const handleSave = () => {
    if (!isMaxColumnWidthDraftValid(maxColumnWidthDraft)) {
      setMaxColumnWidthError(true)
      widthInputRef.current?.focus()
      return
    }
    updateSettings(StoreKey.RUN_WITH_SELECTION, runWithSelectionDraft)
    updateSettings(
      StoreKey.MAX_COLUMN_WIDTH,
      parseMaxColumnWidth(maxColumnWidthDraft),
    )
    onClose()
  }

  return (
    <Form
      onSubmit={(event) => {
        event.preventDefault()
        handleSave()
      }}
    >
      <Body>
        <SettingRow
          label="Run with selection"
          description="Run actions in the editor respect your text selection."
          controlId={RUN_WITH_SELECTION_ID}
        >
          <Switch
            id={RUN_WITH_SELECTION_ID}
            checked={runWithSelectionDraft}
            onChange={setRunWithSelectionDraft}
            ariaDescribedBy={settingDescriptionId(RUN_WITH_SELECTION_ID)}
            dataHook={RUN_WITH_SELECTION_ID}
          />
        </SettingRow>
        <SettingRow
          label="Maximum column width (px)"
          description="Leave empty to size fully automatically. Drag to resize any time."
          controlId={MAX_COLUMN_WIDTH_ID}
        >
          <WidthField>
            <WidthInputRow>
              <WidthInput
                ref={widthInputRef}
                id={MAX_COLUMN_WIDTH_ID}
                value={maxColumnWidthDraft}
                onChange={(event) => {
                  setMaxColumnWidthDraft(event.target.value)
                  setMaxColumnWidthError(false)
                }}
                placeholder="Auto"
                inputMode="numeric"
                variant={maxColumnWidthError ? "error" : undefined}
                aria-invalid={maxColumnWidthError}
                aria-describedby={
                  maxColumnWidthError
                    ? `${settingDescriptionId(
                        MAX_COLUMN_WIDTH_ID,
                      )} ${MAX_COLUMN_WIDTH_ERROR_ID}`
                    : settingDescriptionId(MAX_COLUMN_WIDTH_ID)
                }
                data-hook={MAX_COLUMN_WIDTH_ID}
              />
              <Text color="gray2" size="sm">
                px
              </Text>
            </WidthInputRow>
            {maxColumnWidthError && (
              <div
                id={MAX_COLUMN_WIDTH_ERROR_ID}
                role="alert"
                data-hook={MAX_COLUMN_WIDTH_ERROR_ID}
              >
                <Text color="red" size="sm">
                  Must be a number between {MAX_COLUMN_WIDTH_BOUNDS.min} and{" "}
                  {MAX_COLUMN_WIDTH_BOUNDS.max}
                </Text>
              </div>
            )}
          </WidthField>
        </SettingRow>
      </Body>
      <Dialog.ActionButtons>
        <Button
          skin="secondary"
          type="button"
          onClick={onClose}
          dataHook="editor-settings-cancel"
        >
          Cancel
        </Button>
        <Button skin="primary" type="submit" dataHook="editor-settings-save">
          Save
        </Button>
      </Dialog.ActionButtons>
    </Form>
  )
}

export const EditorSettingsModal = ({ open, onOpenChange }: Props) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <ForwardRef>
        <Overlay primitive={Dialog.Overlay} />
      </ForwardRef>
      <StyledContent
        data-hook="editor-settings-modal"
        aria-describedby={undefined}
      >
        <Dialog.Title>Editor settings</Dialog.Title>
        <EditorSettingsForm onClose={() => onOpenChange(false)} />
      </StyledContent>
    </Dialog.Portal>
  </Dialog.Root>
)
