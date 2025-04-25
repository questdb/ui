import React, { useEffect, useRef } from "react"
import styled from "styled-components"
import { Heading, Table, Select, Button } from "@questdb/react-components"
import { Column, Props as TableProps } from "@questdb/react-components/dist/components/Table"
import { PopperHover, Text, Tooltip } from "../../../components"
import { Box } from "../../../components/Box"
import { bytesWithSuffix } from "../../../utils/bytesWithSuffix"
import { FileStatus } from "./file-status"
import { Grid, Information } from "@styled-icons/remix-line"
import { FiletypeCsv } from "@styled-icons/bootstrap/FiletypeCsv"
import { ProcessedFile } from "./types"
import { UploadActions } from "./upload-actions"
import { RenameTableDialog } from "./rename-table-dialog"
import { Dialog as TableSchemaDialog } from "../../../components/TableSchemaDialog/dialog"
import { UploadResultDialog } from "./upload-result-dialog"
import { shortenText, UploadResult } from "../../../utils"
import { DropBox } from "./dropbox"

const Root = styled(Box).attrs({ flexDirection: "column", gap: "2rem" })`
  padding: 2rem;
`

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

const EmptyState = styled(Box).attrs({ justifyContent: "center" })`
  width: 100%;
  background: #242531;
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 1rem;
`

const FileTextBox = styled(Box)`
  padding: 0 1.1rem;
`

const BrowseTextLink = styled.span`
  text-decoration: underline;
  cursor: pointer;

  &:hover {
    text-decoration: none;
  }
`

type Props = {
  files: ProcessedFile[]
  onDialogToggle: (open: boolean) => void
  onFileRemove: (id: string) => void
  onFileUpload: (id: string) => void
  onFilePropertyChange: (id: string, file: Partial<ProcessedFile>) => void
  onFilesDropped: (files: File[]) => void
  onViewData: (result: UploadResult) => void
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
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
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

  const columns: Column<ProcessedFile>[] = []
  columns.push(
    {
      header: "File",
      align: "flex-start",
      ...(files.length > 0 && { width: "400px" }),
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
                {!data.isUploading &&
                  data.uploadResult !== undefined && (
                    <React.Fragment>
                      <UploadResultDialog file={data} />
                      <Button
                        skin="secondary"
                        prefixIcon={<Grid size="18px" />}
                        onClick={() =>
                          onViewData(
                            data.uploadResult as UploadResult,
                          )
                        }
                      >
                        Result
                      </Button>
                    </React.Fragment>
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
      width: "180px",
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
  )

  if (ownedByList && ownedByList.length > 0) {
    columns.push(
      {
        header: (
          <PopperHover
            placement="top"
            trigger={
              <Box align="center" gap="0.5rem" data-hook="import-table-column-owner">
                Table owner
                <Information size="16px" />
              </Box>
            }
          >
            <Tooltip>
              Required for external (non-database) users.
            </Tooltip>
          </PopperHover>
        ),
        align: "center",
        width: "150px",
        render: ({ data }) => (
          <Select
            name="table_owner"
            defaultValue={ownedByList[0] ?? ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              onFilePropertyChange(data.id, {
                table_owner: e.target.value,
              })
            }
            options={Object.values(ownedByList).map((entity) => ({
              label: entity,
              value: entity,
            }))}
          />
        ),
      },
    )
  }

  columns.push(
    {
      header: (
        <PopperHover
          placement="top"
          trigger={
            <Box align="center" gap="0.5rem" data-hook="import-table-column-schema">
              Schema
              <Information size="16px" />
            </Box>
          }
        >
          <Tooltip>
            Optional. By default, QuestDB will infer schema from the
            CSV file structure
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
            ttlValue={data.ttlValue}
            ttlUnit={data.ttlUnit}
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
            will be overwritten. Required for partitioning and
            timestamp related changes.
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
            onFilePropertyChange(data.id, {
              settings,
            })
          }}
        />
      ),
    },
  )
  
  return (
    <DropBox
      files={files}
      onFilesDropped={onFilesDropped}
      dialogOpen={dialogOpen}
      render={({ duplicates, addToQueue }) => (
        <Root>
          <Heading level={3}>Upload queue</Heading>
          <input
            type="file"
            id="file"
            onChange={(e) => {
              if (e.target.files === null) return
              addToQueue(e.target.files)
            }}
            multiple={true}
            ref={uploadInputRef}
            style={{ display: "none" }}
            value=""
          />
          <Text color="foreground">
            You can drag and drop more files or{" "}
            <BrowseTextLink
              onClick={() => {
                uploadInputRef.current?.click()
              }}
            >
              browse from disk
            </BrowseTextLink>
          </Text>
          {duplicates.length > 0 && (
            <Text color="red">
              File{duplicates.length > 1 ? "s" : ""} already added to queue:{" "}
              {duplicates.map((f) => f.name).join(", ")}. Change target table
              name and try again.
            </Text>
          )}
          <StyledTable<React.FunctionComponent<TableProps<ProcessedFile>>>
            columns={columns}
            rows={files}
          />
          {files.length === 0 && (
            <EmptyState>
              <Text color="gray2" align="center">
                No files in queue
              </Text>
            </EmptyState>
          )}
        </Root>
      )}
    />
  )
}
