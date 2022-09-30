import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import {
  Input,
  PaneMenu,
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

const TabsWrapper = styled.div`
  display: flex;
  overflow: auto;
  flex-shrink: 0;
  white-space: nowrap;
`

const CloseIcon = styled(Close)<{ $visible: boolean }>`
  margin-left: 1rem;

  ${({ $visible }) =>
    $visible
      ? `opacity: 1; pointer-events: all;`
      : `opacity: 0; pointer-events: none;`}
`

const FilenameInput = styled(Input)`
  margin-left: 1rem;
`

const AddTabButton = styled(SecondaryButton)`
  margin-left: 1rem;
`

export const EditorTabs = () => {
  const { activeFile, files, setFiles, setActiveFile, addNewFile, deleteFile } =
    useEditor()
  const inputRef = useRef(null)

  const [fileRenamed, setFileRenamed] = useState<string | undefined>(undefined)
  const [filenameChanged, setFilenameChanged] = useState<string | undefined>(
    undefined,
  )

  const openRename = () => {
    setFileRenamed(activeFile.name)
  }

  const handleRenameBlur = () => {
    setFileRenamed(undefined)
    if (filenameChanged) {
      setFiles(
        files.map((file) =>
          file.name === activeFile.name
            ? { ...file, name: filenameChanged }
            : file,
        ),
      )
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
    if (files && !activeFile) {
      setActiveFile(files[0])
    }
  }, [activeFile, files, setActiveFile])

  useOnClickOutside(inputRef, handleRenameBlur)

  return (
    <PaneMenu>
      {files && activeFile && (
        <TabsWrapper>
          {files.map((file) => (
            <React.Fragment key={`file-${file.name}`}>
              <ContextMenuTrigger id={file.name}>
                <PrimaryToggleButton
                  key={`file-${file.name}`}
                  selected={activeFile.name === file.name}
                  onClick={() => setActiveFile(file)}
                >
                  <FileEdit size="14px" />
                  {fileRenamed === file.name ? (
                    <FilenameInput
                      autoFocus
                      name="file-name"
                      size="sm"
                      defaultValue={file.name}
                      onChange={handleFilenameChange}
                      onKeyDown={handleInputKeyDown}
                      ref={inputRef}
                    />
                  ) : (
                    <span>{file.name}</span>
                  )}
                  <CloseIcon
                    size="14px"
                    onClick={() => deleteFile(file.name)}
                    $visible={files.length > 1 && activeFile.name === file.name}
                  />
                </PrimaryToggleButton>
              </ContextMenuTrigger>
              <ContextMenu id={file.name}>
                <MenuItem onClick={openRename}>Rename</MenuItem>
                <MenuItem onClick={() => deleteFile(file.name)}>
                  Delete file
                </MenuItem>
              </ContextMenu>
            </React.Fragment>
          ))}
        </TabsWrapper>
      )}
      <AddTabButton onClick={addNewFile}>
        <AddCircle size="18px" />
      </AddTabButton>
    </PaneMenu>
  )
}
