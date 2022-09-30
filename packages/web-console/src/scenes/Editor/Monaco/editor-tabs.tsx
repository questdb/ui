import React, { useEffect } from "react"
import styled from "styled-components"
import {
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

const AddTabButton = styled(SecondaryButton)`
  margin-left: 1rem;
`

export const EditorTabs = () => {
  const { activeFile, files, setActiveFile, addNewFile, deleteFile } =
    useEditor()

  useEffect(() => {
    if (files && !activeFile) {
      setActiveFile(files[0])
    }
  }, [activeFile, files, setActiveFile])

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
                  <span>{file.name}</span>
                  <CloseIcon
                    size="14px"
                    onClick={() => deleteFile(file.name)}
                    $visible={files.length > 1 && activeFile.name === file.name}
                  />
                </PrimaryToggleButton>
              </ContextMenuTrigger>
              <ContextMenu id={file.name}>
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
