import React from "react"
import styled from "styled-components"
import { Button, Heading, Switch, Table } from "@questdb/react-components"
import type { Props as TableProps } from "@questdb/react-components/dist/components/Table"
import { PopperHover, Text, Tooltip } from "../../../components"
import { Box } from "../../../components/Box"
import { bytesWithSuffix } from "../../../utils/bytesWithSuffix"
import { FileStatus } from "./file-status"
import { Information, Table as TableIcon } from "styled-icons/remix-line"
import { FiletypeCsv } from "styled-icons/bootstrap"
import { ProcessedFile, WriteMode } from "./types"
import { UploadActions } from "./upload-actions"
import { RenameTableDialog } from "./rename-table-dialog"

const StyledTable = styled(Table)`
  width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0 2rem;

  tr {
    border-radius: ${({ theme }) => theme.borderRadius};
  }

  th {
    padding: 0 1rem;
  }

  td {
    padding: 1rem;
  }

  tbody tr {
    background: ${({ theme }) => theme.color.backgroundLighter};
  }
`

const File = styled(Box).attrs({
  align: "center",
})`
  gap: 1rem;
`

const FileDetails = styled(Box).attrs({
  align: "flex-start",
  flexDirection: "column",
})`
  gap: 0.5rem;
`

const EmptyState = styled(Box).attrs({ justifyContent: "center" })`
  width: 100%;
  background: ${({ theme }) => theme.color.backgroundLighter};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 1rem;
`

type Props = {
  files: ProcessedFile[]
  onFileRemove: (file: ProcessedFile) => void
  onFileUpload: (file: ProcessedFile) => void
  onFilePropertyChange: (filename: string, file: Partial<ProcessedFile>) => void
}

export const FilesToUpload = ({
  files,
  onFileRemove,
  onFilePropertyChange,
  onFileUpload,
}: Props) => {
  const [renameDialogOpen, setRenameDialogOpen] = React.useState<
    string | null
  >()

  return (
    <Box flexDirection="column" gap="2rem">
      <Heading level={3}>Upload queue</Heading>
      <StyledTable<React.FunctionComponent<TableProps<ProcessedFile>>>
        columns={[
          {
            header: "File",
            align: "flex-start",
            width: "40%",
            render: ({ data }) => (
              <File>
                <FiletypeCsv size="32px" />
                <FileDetails>
                  <Text color="foreground">{data.fileObject.name}</Text>
                  <Text color="gray2">
                    {bytesWithSuffix(data.fileObject.size)}
                  </Text>
                </FileDetails>
              </File>
            ),
          },
          {
            header: "Status",
            align: "flex-end",
            width: "200px",
            render: ({ data }) => <FileStatus file={data} />,
          },
          {
            header: "Table name",
            align: "flex-end",
            width: "200px",
            render: ({ data }) => {
              const name = data.table_name ?? data.fileObject.name
              return (
                <RenameTableDialog
                  open={renameDialogOpen === name}
                  onOpenChange={setRenameDialogOpen}
                  onNameChange={(name) => {
                    onFilePropertyChange(data.fileObject.name, {
                      table_name: name,
                    })
                  }}
                  file={data}
                />
              )
            },
          },
          {
            header: "Table schema",
            align: "flex-end",
            width: "150px",
            render: ({ data }) => (
              <Button skin="secondary" prefixIcon={<TableIcon size="18px" />}>
                Add
              </Button>
            ),
          },
          {
            header: (
              <PopperHover
                placement="bottom"
                trigger={
                  <Box align="center" gap="0.5rem">
                    <Information size="14px" />
                    Force header
                  </Box>
                }
              >
                <Tooltip>
                  Enable in case of problems with automated header row detection
                </Tooltip>
              </PopperHover>
            ),
            align: "flex-end",
            width: "150px",
            render: ({ data }) => (
              <Switch
                onChange={(value) => {
                  onFilePropertyChange(data.fileObject.name, {
                    forceHeader: value,
                  })
                }}
              />
            ),
          },
          {
            header: "Actions",
            align: "flex-end",
            width: "300px",
            render: ({ data }) => (
              <UploadActions
                file={data}
                onUpload={onFileUpload}
                onRemove={onFileRemove}
                onModeChange={(mode: WriteMode) => {
                  onFilePropertyChange(data.fileObject.name, {
                    overwrite: mode === "overwrite",
                  })
                }}
              />
            ),
          },
        ]}
        rows={files}
      />
      {files.length === 0 && (
        <EmptyState>
          <Text color="gray2" align="center">
            No files in queue
          </Text>
        </EmptyState>
      )}
    </Box>
  )
}
