import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { Box } from "../../../components/Box"
import { DropBox } from "./dropbox"
import { FilesToUpload } from "./files-to-upload"
import { ProcessedFile } from "./types"
import { SchemaColumn } from "components/TableSchemaDialog/types"
import { useContext } from "react"
import { QuestContext } from "../../../providers"
import { pick, UploadResult, FileCheckStatus } from "../../../utils"
import * as QuestDB from "../../../utils/questdb"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import { DEFAULT_TIMESTAMP_FORMAT, MAX_UNCOMMITTED_ROWS } from "./const"
import { useIsVisible } from "../../../components"
import {
  extractPrecisionFromGeohash,
  isGeoHash,
  mapColumnTypeToQuestDB,
  mapColumnTypeToUI,
  uuid,
} from "./utils"
import { Upload } from "./upload"

type State = "upload" | "list"

type Props = {
  onImported: (result: UploadResult) => void
}

const Root = styled(Box).attrs({ gap: "4rem", flexDirection: "column" })`
  flex: 1;
`

export const ImportCSVFiles = ({ onImported }: Props) => {
  const { quest } = useContext(QuestContext)
  const [filesDropped, setFilesDropped] = useState<ProcessedFile[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const tables = useSelector(selectors.query.getTables)
  const rootRef = useRef<HTMLDivElement>(null)
  const isVisible = useIsVisible(rootRef)
  const [state, setState] = useState<State>("upload")

  const setFileProperties = (id: string, file: Partial<ProcessedFile>) => {
    setFilesDropped((files) =>
      files.map((f) => {
        if (f.id === id) {
          return {
            ...f,
            ...file,
          }
        }
        return f
      }),
    )
  }

  const setIsUploading = (file: ProcessedFile, isUploading: boolean) => {
    setFileProperties(file.id, { isUploading })
  }

  const getFileConfigs = async (files: File[]): Promise<ProcessedFile[]> => {
    return await Promise.all(
      files.map(async (file) => {
        const result = await quest.checkCSVFile(file.name)

        const schema =
          result.status === FileCheckStatus.EXISTS
            ? await (async () => {
                const columnResponse = await quest.showColumns(file.name)
                if (
                  columnResponse &&
                  columnResponse.type === QuestDB.Type.DQL
                ) {
                  // Find a table schema
                  return columnResponse.data.map((column) => ({
                    name: column.column,
                    type: mapColumnTypeToUI(column.type),
                    pattern: DEFAULT_TIMESTAMP_FORMAT,
                    precision: isGeoHash(column.type)
                      ? extractPrecisionFromGeohash(column.type)
                      : "",
                  }))
                }
                return []
              })()
            : []

        const partitionBy =
          result.status === FileCheckStatus.EXISTS && tables
            ? await (async () => {
                const table = tables.find((t) => t.name === file.name)
                return table?.partitionBy ?? "NONE"
              })()
            : "NONE"

        const timestamp =
          result.status === FileCheckStatus.EXISTS && tables
            ? await (async () => {
                const table = tables.find((t) => t.name === file.name)
                return table?.designatedTimestamp ?? ""
              })()
            : ""

        return {
          id: uuid(),
          fileObject: file,
          table_name: file.name,
          status: result.status,
          exists: result.status === FileCheckStatus.EXISTS,
          schema,
          partitionBy,
          timestamp,
          settings: {
            forceHeader: false,
            overwrite: false,
            skipLev: false,
            delimiter: "",
            atomicity: "skipCol",
            maxUncommitedRows: MAX_UNCOMMITTED_ROWS,
          },
          isUploading: false,
          uploaded: false,
          uploadResult: undefined,
          uploadProgress: 0,
        }
      }),
    )
  }

  const handleDrop = async (files: File[]) => {
    const fileConfigs = await getFileConfigs(files)
    setFilesDropped((filesDropped) => [...filesDropped, ...fileConfigs])
    setState("list")
  }

  const handleVisible = async () => {
    const fileStatusList = await Promise.all(
      filesDropped.map(async (file) => {
        const result = await quest.checkCSVFile(file.table_name)
        return {
          ...file,
          status: result.status,
        }
      }),
    )
    setFilesDropped(fileStatusList)
  }

  useEffect(() => {
    if (isVisible) {
      handleVisible()
    }
  }, [isVisible])

  return (
    <Root ref={rootRef}>
      {state === "upload" && (
        <Upload
          files={filesDropped}
          onFilesDropped={handleDrop}
          dialogOpen={dialogOpen}
        />
      )}

      {state === "list" && (
        <FilesToUpload
          dialogOpen={dialogOpen}
          files={filesDropped}
          onFilesDropped={handleDrop}
          onDialogToggle={setDialogOpen}
          onFileUpload={async (id) => {
            const file = filesDropped.find((f) => f.id === id) as ProcessedFile

            if (file.isUploading) {
              return
            }
            setIsUploading(file, true)
            try {
              const response = await quest.uploadCSVFile({
                file: file.fileObject,
                name: file.table_name,
                settings: file.settings,
                schema: file.schema.map(mapColumnTypeToQuestDB),
                partitionBy: file.partitionBy,
                timestamp: file.timestamp,
                onProgress: (progress) => {
                  setFileProperties(file.id, {
                    uploadProgress: progress,
                  })
                },
              })
              setFileProperties(file.id, {
                uploaded: response.status === "OK",
                uploadResult: response.status === "OK" ? response : undefined,
                schema:
                  response.status === "OK"
                    ? response.columns.map((c) => {
                        // Schema response only contains name and type,
                        // so we look for the pattern provided before upload and augment the schema
                        const match = file.schema.find((s) => s.name === c.name)
                        return {
                          ...pick(c, ["name"]),
                          ...{
                            type: mapColumnTypeToUI(c.type),
                            pattern:
                              c.type === "TIMESTAMP"
                                ? match?.pattern
                                  ? match?.pattern
                                  : DEFAULT_TIMESTAMP_FORMAT
                                : "",
                            precision: isGeoHash(c.type)
                              ? extractPrecisionFromGeohash(c.type)
                              : undefined,
                          },
                        } as SchemaColumn
                      })
                    : file.schema,
                error: response.status === "OK" ? undefined : response.status,
              })
              if (response.status === "OK") {
                onImported(response)
              }
              setIsUploading(file, false)
            } catch (err) {
              setIsUploading(file, false)
              setFileProperties(file.id, {
                uploaded: false,
                uploadResult: undefined,
                uploadProgress: 0,
                error: "Upload error",
              })
            }
          }}
          onFileRemove={(id) => {
            const file = filesDropped.find((f) => f.id === id) as ProcessedFile
            setFilesDropped(
              filesDropped.filter(
                (f) => f.fileObject.name !== file.fileObject.name,
              ),
            )
          }}
          onFilePropertyChange={async (id, partialFile) => {
            const processedFiles = await Promise.all(
              filesDropped.map(async (file) => {
                if (file.id === id) {
                  // Only check for file existence if table name is changed
                  const result = partialFile.table_name
                    ? await quest.checkCSVFile(partialFile.table_name)
                    : await Promise.resolve({ status: file.status })
                  return {
                    ...file,
                    ...partialFile,
                    status: result.status,
                    error: partialFile.table_name ? undefined : file.error, // reset prior error if table name is changed
                  }
                } else {
                  return file
                }
              }),
            )
            setFilesDropped(processedFiles)
          }}
        />
      )}
    </Root>
  )
}
