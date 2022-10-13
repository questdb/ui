import React, { useRef, useState } from "react"
import styled from "styled-components"
import {
  Input,
  PaneMenu as PaneMenuRaw,
  PrimaryToggleButton,
  SecondaryButton,
} from "../../../components"
import {
  ContextMenuTrigger,
  ContextMenu,
  MenuItem,
} from "../../../components/ContextMenu"
import {
  AddCircle,
  Close,
  FileEdit as FileEditIcon,
} from "styled-icons/remix-line"
import { useEditor } from "../../../providers"
import { useOnClickOutside } from "usehooks-ts"

const PaneMenu = styled(PaneMenuRaw)`
  padding-left: 0;
  overflow-x: auto;
`

const TabsWrapper = styled.div`
  display: flex;
  overflow: auto;
  flex-shrink: 0;
  white-space: nowrap;
`

const CloseIcon = styled(Close)`
  margin-left: 1rem;
`

const FilenameInput = styled(Input)`
  margin-left: 1rem;
`

const AddTabButton = styled(SecondaryButton)`
  margin-left: 1rem;
`

const EditableLabel = ({
  label,
  onChange,
  onCancel,
  isEditing,
}: {
  label: string
  onChange(label: string): void
  onCancel(): void
  isEditing: boolean
}) => {
  const [value, setValue] = useState(label)

  const inputRef = useRef(null)

  useOnClickOutside(inputRef, onCancel)

  if (isEditing) {
    return (
      <FilenameInput
        autoFocus
        size="sm"
        defaultValue={value}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
          setValue(event.target.value)
        }
        onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Enter") {
            onChange(value)
          }
        }}
        inputRef={inputRef}
      />
    )
  }
  return <span>{label}</span>
}

export const EditorTabs = () => {
  const {
    activeBuffer,
    buffers,
    setActiveBuffer,
    addBuffer,
    deleteBuffer,
    updateBuffer,
  } = useEditor()
  const [editingId, setEditingId] = useState<number | null>(null)

  return (
    <PaneMenu>
      {buffers && activeBuffer && (
        <TabsWrapper>
          {buffers.map((buffer) => (
            <React.Fragment key={buffer.id}>
              <ContextMenuTrigger id={`${buffer.id}`}>
                <PrimaryToggleButton
                  selected={activeBuffer.id === buffer.id}
                  onClick={async () => {
                    await setActiveBuffer(buffer)
                    setEditingId(null)
                  }}
                >
                  <FileEditIcon size="14px" />

                  <EditableLabel
                    isEditing={editingId === buffer.id}
                    label={buffer.label}
                    onChange={(label) => {
                      updateBuffer(buffer.id as number, { label })
                    }}
                    onCancel={() => {
                      setEditingId(null)
                    }}
                  />

                  {buffers.length > 1 && (
                    <CloseIcon
                      size="14px"
                      onClick={(event) => {
                        // prevent event bubbling from triggering `setActiveBuffer`
                        event.stopPropagation()
                        deleteBuffer(buffer.id as number)
                      }}
                    />
                  )}
                </PrimaryToggleButton>
              </ContextMenuTrigger>

              <ContextMenu id={`${buffer.id}`}>
                <MenuItem onClick={() => setEditingId(buffer.id as number)}>
                  Rename
                </MenuItem>
                <MenuItem onClick={() => deleteBuffer(buffer.id as number)}>
                  Close
                </MenuItem>
              </ContextMenu>
            </React.Fragment>
          ))}
        </TabsWrapper>
      )}

      <AddTabButton onClick={addBuffer}>
        <AddCircle size="18px" />
      </AddTabButton>
    </PaneMenu>
  )
}
