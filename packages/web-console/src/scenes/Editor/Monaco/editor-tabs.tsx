import React, { useEffect, useRef, useState } from "react"
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
import { AddCircle, Close, FileEdit } from "styled-icons/remix-line"
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

export const EditorTabs = () => {
  const {
    activeBuffer,
    buffers,
    setActiveBuffer,
    addBuffer,
    deleteBuffer,
    renameBuffer,
  } = useEditor()
  const inputRef = useRef(null)

  const [fileRenamed, setFileRenamed] = useState<string | undefined>(undefined)
  const [filenameChanged, setFilenameChanged] = useState<string | undefined>(
    undefined,
  )

  const handleRenameBlur = () => {
    setFileRenamed(undefined)
    if (filenameChanged) {
      renameBuffer(activeBuffer.label, filenameChanged)
    }
  }

  const handleFilenameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilenameChanged(event.currentTarget.value)
  }

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      handleRenameBlur()
    }
  }

  useEffect(() => {
    if (buffers && !activeBuffer) {
      setActiveBuffer(buffers[0])
    }
  }, [activeBuffer, buffers, setActiveBuffer])

  useOnClickOutside(inputRef, handleRenameBlur)

  return (
    <PaneMenu>
      {buffers && activeBuffer && (
        <TabsWrapper>
          {buffers.map((buffer) => (
            <React.Fragment key={buffer.id}>
              <ContextMenuTrigger id={buffer.id}>
                <PrimaryToggleButton
                  selected={activeBuffer.id === buffer.id}
                  onClick={() => {
                    setActiveBuffer(buffer)
                    setFileRenamed(undefined)
                  }}
                >
                  <FileEdit size="14px" />

                  {fileRenamed === buffer.label ? (
                    <FilenameInput
                      autoFocus
                      size="sm"
                      defaultValue={buffer.label}
                      onChange={handleFilenameChange}
                      onKeyDown={handleInputKeyDown}
                      ref={inputRef}
                    />
                  ) : (
                    <span>{buffer.label}</span>
                  )}

                  {buffers.length > 1 && (
                    <CloseIcon
                      size="14px"
                      onClick={() => deleteBuffer(buffer.id)}
                    />
                  )}
                </PrimaryToggleButton>
              </ContextMenuTrigger>

              <ContextMenu id={buffer.id}>
                <MenuItem
                  onClick={() => {
                    setActiveBuffer(buffer)
                    setFileRenamed(buffer.label)
                  }}
                >
                  Rename
                </MenuItem>
                <MenuItem onClick={() => deleteBuffer(buffer.id)}>
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
