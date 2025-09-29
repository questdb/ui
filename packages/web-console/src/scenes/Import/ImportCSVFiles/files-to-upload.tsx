import React from "react"
import styled from "styled-components"
import { Heading } from "@questdb/react-components"
import { Text } from "../../../components"
import { Box } from "../../../components/Box"
import { ProcessedFile } from "./types"
import { Dropbox } from "../Dropbox"
import { DropboxUploadArea } from "../DropboxUploadArea"
import { CSVUploadList } from "./CSVUploadList"

const Root = styled(Box).attrs({ flexDirection: "column", gap: "2rem" })`
  padding: 2rem;
`

const EmptyState = styled(Box).attrs({ justifyContent: "center" })`
  width: 100%;
  background: #242531;
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 1rem;
`

type Props = {
  files: ProcessedFile[]
  onDialogToggle: (open: boolean) => void
  onFileRemove: (filename: string) => void
  onFileUpload: (filename: string) => void
  onFilePropertyChange: (id: string, file: Partial<ProcessedFile>) => void
  onFilesDropped: (files: File[]) => void
  onViewData: (query: string) => void
  dialogOpen: boolean
  ownedByList: string[]
}

export const FilesToUpload = ({
  files,
  onDialogToggle,
  onFileRemove,
  onFilePropertyChange,
  onFileUpload,
  onFilesDropped,
  onViewData,
  dialogOpen,
  ownedByList,
}: Props) => {
  const existingFileNames = files.map((f) => f.table_name)

  return (
    <Dropbox
      existingFileNames={existingFileNames}
      onFilesDropped={onFilesDropped}
      dialogOpen={dialogOpen}
      enablePaste={true}
      render={({ duplicates, addToQueue, uploadInputRef }) => (
        <Root>
          <Heading level={3}>Import queue</Heading>
          <DropboxUploadArea
            title=""
            accept=".csv"
            uploadInputRef={uploadInputRef}
            addToQueue={addToQueue}
            duplicates={duplicates}
            mode="list"
          />
          
          {files.length === 0 ? (
            <EmptyState>
              <Text color="gray2" align="center">
                No files in queue
              </Text>
            </EmptyState>
          ) : (
            <CSVUploadList
              files={files}
              ownedByList={ownedByList}
              onFileRemove={onFileRemove}
              onFileUpload={onFileUpload}
              onFilePropertyChange={(id, file) => onFilePropertyChange(id, file as Partial<ProcessedFile>)}
              onViewData={onViewData}
              onDialogToggle={onDialogToggle}
            />
          )}
        </Root>
      )}
    />
  )
}
