import React, { useEffect } from "react"
import styled from "styled-components"
import { Heading, Table, Select } from "@questdb/react-components"
import type { Props as TableProps } from "@questdb/react-components/dist/components/Table"
import { PopperHover, Text, Tooltip } from "../../../components"
import { Box } from "../../../components/Box"
import { bytesWithSuffix } from "../../../utils/bytesWithSuffix"
import { FileStatus } from "./file-status"
import { Information } from "@styled-icons/remix-line"
import { FiletypeCsv } from "@styled-icons/bootstrap/FiletypeCsv"
import { ProcessedFile } from "./types"
import { UploadActions } from "./upload-actions"
import { RenameTableDialog } from "./rename-table-dialog"
import { Dialog as TableSchemaDialog } from "../../../components/TableSchemaDialog/dialog"
import { UploadResultDialog } from "./upload-result-dialog"
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

const EmptyState = styled(Box).attrs({ justifyContent: "center" })`
  width: 100%;
  background: ${({ theme }) => theme.color.backgroundLighter};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 1rem;
`

const FileTextBox = styled(Box)`
  padding: 0 1.1rem;
`

type Props = {
  files: ProcessedFile[]
  onDialogToggle: (open: boolean) => void
  onFileRemove: (id: string) => void
  onFileUpload: (id: string) => void
  onFilePropertyChange: (id: string, file: Partial<ProcessedFile>) => void
}

export const FilesToUpload = ({
  files,
  onDialogToggle,
  onFileRemove,
  onFilePropertyChange,
  onFileUpload,
}: Props) => {
  const [renameDialogOpen, setRenameDialogOpen] = React.useState<
    string | undefined
  >()

  const [schemaDialogOpen, setSchemaDialogOpen] = React.useState<
    string | undefined
  >()

  useEffect(() => {
    onDialogToggle(
      renameDialogOpen !== undefined || schemaDialogOpen !== undefined,
    )
  }, [renameDialogOpen, schemaDialogOpen])

  return (
    <Box flexDirection="column" gap="2rem">
      <Heading level={3}>Upload queue</Heading>
      <StyledTable<React.FunctionComponent<TableProps<ProcessedFile>>>
        columns={[
          {
            header: "File",
            align: "flex-start",
            ...(files.length > 0 && { width: "350px" }),
            render: ({ data }) => {
              const file = (
                <FileTextBox align="center" gap="1rem">
                  <Text color="foreground">
                    {shortenText(data.fileObject.name, 20)}
                  </Text>

                  <Text color="gray2" size="sm">
                    {bytesWithSuffix(data.fileObject.size)}
                  </Text>
                </FileTextBox>
              )
              return (
                <Box align="center" gap="1rem">
                  <FiletypeCsv size="46px" />
                  <Box gap="1rem" align="flex-4tart" flexDirection="column">
                    {data.fileObject.name.length > 20 && (
                      <PopperHover placement="top" trigger={file}>
                        <Tooltip>{data.fileObject.name}</Tooltip>
                      </PopperHover>
                    )}
                    {data.fileObject.name.length <= 20 && file}
                    <Box gap="1rem" align="center">
                      <FileStatus file={data} />
                      {!data.isUploading && data.uploadResult && (
                        <UploadResultDialog file={data} />
                      )}
                    </Box>
                    {(data.uploadResult &&
                      data.uploadResult.rowsRejected > 0) ||
                      (data.error && (
                        <FileTextBox
                          flexDirection="column"
                          gap="1rem"
                          align="flex-start"
                        >
                          {data.uploadResult &&
                            data.uploadResult.rowsRejected > 0 && (
                              <Text color="orange" size="sm">
                                {data.uploadResult.rowsRejected.toLocaleString()}{" "}
                                row
                                {data.uploadResult.rowsRejected > 1
                                  ? "s"
                                  : ""}{" "}
                                rejected
                              </Text>
                            )}
                          {data.error && (
                            <Text color="red" size="sm">
                              {data.error}
                            </Text>
                          )}
                        </FileTextBox>
                      ))}
                  </Box>
                </Box>
              )
            },
          },
          {
            header: "Table name",
            align: "flex-end",
            width: "200px",
            render: ({ data }) => {
              return (
                <RenameTableDialog
                  open={renameDialogOpen === data.id}
                  onOpenChange={(f) => setRenameDialogOpen(f?.id)}
                  onNameChange={(name) => {
                    onFilePropertyChange(data.id, {
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
                placement="top"
                trigger={
                  <Box align="center" gap="0.5rem">
                    Schema
                    <Information size="16px" />
                  </Box>
                }
              >
                <Tooltip>
                  Optional. By default, QuestDB will infer schema from the CSV
                  file structure
                </Tooltip>
              </PopperHover>
            ),

            align: "center",
            width: "150px",
            render: ({ data }) => {
              const name = data.table_name ?? data.fileObject.name
              return (
                <TableSchemaDialog
                  action="import"
                  open={schemaDialogOpen === data.id}
                  onOpenChange={(name?: string) =>
                    setSchemaDialogOpen(name ? data.id : undefined)
                  }
                  onSchemaChange={(schema) => {
                    onFilePropertyChange(data.id, {
                      schema: schema.schemaColumns,
                      partitionBy: schema.partitionBy,
                      timestamp: schema.timestamp,
                    })
                  }}
                  name={name}
                  schema={data.schema}
                  partitionBy={data.partitionBy}
                  timestamp={data.timestamp}
                  isEditLocked={
                    data.exists && data.table_name === data.fileObject.name
                  }
                  hasWalSetting={false}
                  ctaText="Save"
                />
              )
            },
          },
          {
            header: (
              <PopperHover
                placement="top"
                trigger={
                  <Box align="center" gap="0.5rem">
                    Write mode
                    <Information size="16px" />
                  </Box>
                }
              >
                <Tooltip>
                  <strong>Append</strong>: data will be appended to the set.
                  <br />
                  <strong>Overwrite</strong>: any existing data or structure
                  will be overwritten. Required for partitioning and timestamp
                  related changes.
                </Tooltip>
              </PopperHover>
            ),
            align: "center",
            width: "150px",
            render: ({ data }) => (
              <Select
                name="overwrite"
                defaultValue={data.settings.overwrite ? "true" : "false"}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  onFilePropertyChange(data.id, {
                    settings: {
                      ...data.settings,
                      overwrite: e.target.value === "true",
                    },
                  })
                }
                options={[
                  {
                    label: "Append",
                    value: "false",
                  },
                  {
                    label: "Overwrite",
                    value: "true",
                  },
                ]}
              />
            ),
          },
          {
            align: "flex-end",
            width: "300px",
            render: ({ data }) => (
              <UploadActions
                file={data}
                onUpload={onFileUpload}
                onRemove={onFileRemove}
                onSettingsChange={(settings) => {
                  onFilePropertyChange(data.fileObject.name, {
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
