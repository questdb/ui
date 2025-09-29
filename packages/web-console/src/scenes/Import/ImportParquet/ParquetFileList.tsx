import React, { useCallback, useRef, useState } from "react"
import styled from "styled-components"
import { Table, Button } from "@questdb/react-components"
import { Column } from "@questdb/react-components/dist/components/Table"
import { Box } from "../../../components/Box"
import { Text } from "../../../components/Text"
import { Close } from "@styled-icons/remix-line"
import { Eye } from "@styled-icons/remix-line"
import { ProcessedParquet } from "./types"
import { bytesWithSuffix } from "../../../utils/bytesWithSuffix"
import { PopperHover, Tooltip } from "../../../components"
import { RenameFileDialog } from "./rename-file-dialog"
import { FileStatus } from "../FileStatus"
import { shortenText } from "../../../utils"

const StyledTable = styled(Table)`
  width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0 2rem;

  th {
    padding: 0 1.5rem;
  }

  td {
    padding: 1.5rem;
  }

  tbody td {
    background: #242531;

    &:first-child {
      border-top-left-radius: ${({ theme }) => theme.borderRadius};
      border-bottom-left-radius: ${({ theme }) => theme.borderRadius};
    }

    &:last-child {
      border-top-right-radius: ${({ theme }) => theme.borderRadius};
      border-bottom-right-radius: ${({ theme }) => theme.borderRadius};
    }
  }
`

const FileTextBox = styled(Box)`
  padding: 0 1.1rem;
`

const FileSize = styled(Text)`
  font-size: 13px;
  line-height: 2;
`

const HiddenInput = styled.input`
  display: none;
`

interface Props {
  files: ProcessedParquet[]
  onRemoveFile: (id: string) => void
  onFileNameChange: (id: string, name: string) => void
  onAddMoreFiles: (files: File[]) => void
  onViewData: (query: string) => void
  onSingleFileUpload: (id: string) => void
  isUploading: boolean
}

export const ParquetFileList = ({
  files,
  onRemoveFile,
  onFileNameChange,
  onAddMoreFiles,
  onViewData,
  onSingleFileUpload,
  isUploading,
}: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [renameDialogOpen, setRenameDialogOpen] = useState<string | undefined>()

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onAddMoreFiles(Array.from(e.target.files))
      e.target.value = ""
    }
  }, [onAddMoreFiles])

  const columns: Column<ProcessedParquet>[] = [
    {
      header: "Parquet File",
      align: "flex-start",
      width: "400px",
      render: ({ data }) => {
        const fileInfo = (
          <FileTextBox align="center" gap="1rem">
            <Text color="foreground">
              {shortenText(data.fileObject.name, 40)}
            </Text>
            <FileSize color="gray2" size="sm">
              {bytesWithSuffix(data.fileObject.size)}
            </FileSize>
          </FileTextBox>
        )

        return (
          <Box gap="1rem" align="flex-start" flexDirection="column">
            <Box align="center" gap="1rem">
              <img
                src="assets/parquet-file.svg"
                alt="Parquet icon"
                width="48"
                height="48"
                style={{ alignSelf: "flex-start" }}
              />
              <Box gap="1rem" align="flex-start" flexDirection="column">
                {fileInfo}
                <Box gap="1rem" align="flex-start">
                  <FileStatus file={data} />
                  {data.uploaded && (
                    <Button
                      prefixIcon={<Eye size="18px" />}
                      skin="secondary"
                      onClick={() => onViewData(`SELECT * FROM read_parquet('${data.file_name}')`)}
                    >
                      View data
                    </Button>
                  )}
                </Box>
              </Box>
            </Box>
          </Box>
        )
      },
    },
    {
      header: "Import Path",
      align: "flex-end",
      width: "400px",
      render: ({ data }) => (
        <RenameFileDialog
          open={renameDialogOpen === data.id}
          onOpenChange={(f) => setRenameDialogOpen(f?.id)}
          onNameChange={(name) => {
            onFileNameChange(data.id, name)
          }}
          file={data}
        />
      ),
    },
    {
      header: "",
      align: "flex-end",
      width: "300px",
      render: ({ data }) => (
        <Box gap="1rem" align="center">
          {data.error && (
            <Button
              skin="secondary"
              onClick={() => onSingleFileUpload(data.id)}
              disabled={isUploading}
            >
              Retry upload
            </Button>
          )}
          <PopperHover
            placement="top"
            trigger={
              <Button
                skin="secondary"
                onClick={() => onRemoveFile(data.id)}
              >
                <Close size="18px" />
              </Button>
            }
          >
            <Tooltip>Remove file from queue</Tooltip>
          </PopperHover>
        </Box>
      ),
    },
  ]

  return (
    <>
      <StyledTable columns={columns} rows={files} />
      <HiddenInput
        ref={fileInputRef}
        type="file"
        accept=".parquet"
        multiple
        onChange={handleFileInputChange}
      />
    </>
  )
}