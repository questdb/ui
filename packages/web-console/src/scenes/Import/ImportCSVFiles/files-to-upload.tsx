import React from "react"
import styled from "styled-components"
import { Heading, Table } from "@questdb/react-components"
import type { Props as TableProps } from "@questdb/react-components/dist/components/Table"
import { PopperHover, Text, Tooltip } from "../../../components"
import { Box } from "../../../components/Box"
import { bytesWithSuffix } from "../../../utils/bytesWithSuffix"
import { FileStatus } from "./file-status"
import { Information } from "styled-icons/remix-line"
import { FiletypeCsv } from "styled-icons/bootstrap"
import { ProcessedFile } from "./types"
import { UploadActions } from "./upload-actions"
import { RenameTableDialog } from "./rename-table-dialog"
import { TableSchemaDialog } from "./table-schema-dialog"

const StyledTable = styled(Table)`
  width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0 2rem;

  th {
    padding: 0 2rem;
  }

  td {
    padding: 2rem;
  }

  tbody td {
    background: ${({ theme }) => theme.color.backgroundLighter};

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

  const [schemaDialogOpen, setSchemaDialogOpen] = React.useState<
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
            width: "35%",
            render: ({ data }) => (
              <File>
                <FiletypeCsv size="36px" />
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
            width: "250px",
            render: ({ data }) => (
              <Box flexDirection="column" align="flex-end" gap="1rem">
                <FileStatus file={data} />
                {data.uploadResult && data.uploadResult.rowsRejected > 0 && (
                  <Text color="orange" size="sm">
                    {data.uploadResult.rowsRejected.toLocaleString()} row
                    {data.uploadResult.rowsRejected > 1 ? "s" : ""} rejected
                  </Text>
                )}
              </Box>
            ),
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
            header: (
              <PopperHover
                placement="bottom"
                trigger={
                  <Box align="center" gap="0.5rem">
                    <Information size="16px" />
                    Schema
                  </Box>
                }
              >
                <Tooltip>
                  Optional. By default, QuestDB will infer schema from the CSV
                  file structure
                </Tooltip>
              </PopperHover>
            ),

            align: "flex-end",
            width: "150px",
            render: ({ data }) => (
              <TableSchemaDialog
                open={schemaDialogOpen === data.table_name}
                onOpenChange={setSchemaDialogOpen}
                onSchemaChange={(schema) => {
                  onFilePropertyChange(data.table_name, {
                    schema: schema.schemaColumns,
                    partitionBy: schema.partitionBy,
                    timestamp: schema.timestamp,
                  })
                }}
                file={data}
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
                onSettingsChange={(settings) => {
                  onFilePropertyChange(data.table_name, {
                    settings,
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
