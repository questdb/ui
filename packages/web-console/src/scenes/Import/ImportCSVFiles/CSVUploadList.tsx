import React, { useState, useEffect } from "react"
import styled from "styled-components"
import { Table, Button, Select } from "@questdb/react-components"
import { Column } from "@questdb/react-components/dist/components/Table"
import { Box } from "../../../components/Box"
import { Text } from "../../../components/Text"
import { Grid, Information } from "@styled-icons/remix-line"
import { ProcessedCSV } from "./types"
import { CSVUploadResult, UploadModeSettings } from "../../../utils"
import { RenameTableDialog } from "./rename-table-dialog"
import { FileStatus } from "../FileStatus"
import { UploadActions } from "./upload-actions"
import { UploadResultDialog } from "./upload-result-dialog"
import { shortenText } from "../../../utils"
import { bytesWithSuffix } from "../../../utils/bytesWithSuffix"
import { PopperHover, Tooltip } from "../../../components"
import { Dialog as TableSchemaDialog } from "../../../components/TableSchemaDialog/dialog"

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

interface Props {
  files: ProcessedCSV[]
  ownedByList: string[]
  onFileRemove: (id: string) => void
  onFileUpload: (id: string) => void
  onFilePropertyChange: (id: string, file: Partial<ProcessedCSV>) => void
  onViewData: (query: string) => void
  onDialogToggle: (open: boolean) => void
}

export const CSVUploadList = ({
  files,
  ownedByList,
  onFileRemove,
  onFileUpload,
  onFilePropertyChange,
  onViewData,
  onDialogToggle,
}: Props) => {
  const [renameDialogOpen, setRenameDialogOpen] = useState<string | undefined>()
  const [schemaDialogOpen, setSchemaDialogOpen] = useState<string | undefined>()

  useEffect(() => {
    onDialogToggle(renameDialogOpen !== undefined || schemaDialogOpen !== undefined)
  }, [renameDialogOpen, schemaDialogOpen, onDialogToggle])

  if (files.length === 0) {
    return null
  }

  const columns: Column<ProcessedCSV>[] = [
    {
      header: "CSV File",
      align: "flex-start",
      width: "400px",
      render: ({ data }) => {
        const needsTooltip = data.fileObject.name.length > 20
        const fileInfo = (
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
          <Box gap="1rem" align="flex-start" flexDirection="column">
            <Box align="center" gap="1rem">
              <img 
                src="assets/csv-file.svg"
                alt="CSV file icon"
                width="48"
                height="48"
                style={{ alignSelf: "flex-start" }}
              />
              <Box gap="1rem" align="flex-start" flexDirection="column">
                {needsTooltip ? (
                  <PopperHover placement="top" trigger={fileInfo}>
                    <Tooltip>{data.fileObject.name}</Tooltip>
                  </PopperHover>
                ) : (
                  fileInfo
                )}
                <Box gap="1rem" align="flex-start">
                  <FileStatus file={data} />
                  {!data.isUploading && data.uploadResult && (
                    <>
                      <UploadResultDialog file={data} />
                      <Button
                        skin="secondary"
                        disabled={data.uploadResult?.status !== "OK"}
                        prefixIcon={<Grid size="18px" />}
                        onClick={() => {
                          const csvResult = data.uploadResult
                          onViewData(`"${csvResult?.location}"`)
                        }}
                      >
                        Result
                      </Button>
                    </>
                  )}
                </Box>
              </Box>
            </Box>
            {data.uploadResult && data.uploadResult.rowsRejected > 0 && (
              <FileTextBox flexDirection="column" gap="1rem" align="flex-start">
                <Text color="orange" size="sm">
                  {data.uploadResult.rowsRejected.toLocaleString()} row
                  {data.uploadResult.rowsRejected > 1 ? "s" : ""} rejected
                </Text>
              </FileTextBox>
            )}
          </Box>
        )
      },
    },
    {
      header: "Table name",
      align: "flex-end",
      width: "180px",
      render: ({ data }) => (
        <RenameTableDialog
          open={renameDialogOpen === data.id}
          onOpenChange={(f) => setRenameDialogOpen(f?.id)}
          onNameChange={(name) => {
            onFilePropertyChange(data.id, { table_name: name })
          }}
          file={data}
        />
      ),
    },
  ]

  if (ownedByList.length > 0) {
    columns.push({
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
          <Tooltip>Required for external (non-database) users.</Tooltip>
        </PopperHover>
      ),
      align: "center",
      width: "150px",
      render: ({ data }) => (
        <Select
          name="table_owner"
          defaultValue={data.table_owner || ownedByList[0] || ""}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            onFilePropertyChange(data.id, {
              table_owner: e.target.value,
            })
          }
          options={ownedByList.map((entity) => ({
            label: entity,
            value: entity,
          }))}
        />
      ),
    })
  }

  columns.push({
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
          Optional. By default, QuestDB will infer schema from the CSV file
          structure
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
          isEditLocked={data.exists && data.table_name === data.fileObject.name}
          hasWalSetting={false}
          ctaText="Save"
        />
      )
    },
  })

  columns.push({
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
          <strong>Overwrite</strong>: any existing data or structure will be
          overwritten. Required for partitioning and timestamp related changes.
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
  })
  columns.push({
    align: "flex-end",
    width: "300px",
    render: ({ data }) => (
      <UploadActions
        file={data}
        onUpload={() => onFileUpload(data.id)}
        onRemove={() => onFileRemove(data.id)}
        onSettingsChange={(settings: UploadModeSettings) => {
          onFilePropertyChange(data.id, { settings })
        }}
      />
    ),
  })

  return (
    <StyledTable columns={columns} rows={files} />
  )
}