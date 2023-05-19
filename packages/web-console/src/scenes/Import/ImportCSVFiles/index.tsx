import React, { useEffect, useRef, useState } from "react"
import { Box } from "../../../components/Box"
import { DropBox } from "./dropbox"
import { FilesToUpload } from "./files-to-upload"
import { ProcessedFile, SchemaColumn } from "./types"
import { useContext } from "react"
import { QuestContext } from "../../../providers"
import { pick, UploadResult, FileCheckStatus } from "../../../utils"
import * as QuestDB from "../../../utils/questdb"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import { DEFAULT_TIMESTAMP_FORMAT, MAX_UNCOMMITTED_ROWS } from "./const"
import { useIsVisible } from "../../../components/Hooks"

type Props = {
  onImported: (result: UploadResult) => void
}

const isGeoHash = (type: string) => type.startsWith("GEOHASH")

function extractPrecionFromGeohash(geohash: string) {
  const regex = /\(([^)]+)\)/g
  const matches = regex.exec(geohash)
  if (matches && matches.length > 1) {
    return matches[1]
  }
  return ""
}

const mapColumnTypeToUI = (type: string) => {
  if (isGeoHash(type)) {
    return "GEOHASH"
  } else return type.toUpperCase()
}

const mapColumnTypeToQuestDB = (column: SchemaColumn) => {
  if (column.type === "GEOHASH") {
    return {
      ...column,
      type: `GEOHASH(${column.precision})`,
    }
  }
  return column
}

export const ImportCSVFiles = ({ onImported }: Props) => {
  const { quest } = useContext(QuestContext)
  const [filesDropped, setFilesDropped] = useState<ProcessedFile[]>([])
  const tables = useSelector(selectors.query.getTables)
  const rootRef = useRef<HTMLDivElement>(null)
  const isVisible = useIsVisible(rootRef)

  const setFileProperties = (
    filename: string,
    file: Partial<ProcessedFile>,
  ) => {
    setFilesDropped((files) =>
      files.map((f) => {
        if (f.table_name === filename) {
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
    setFileProperties(file.table_name, { isUploading })
  }

  const getFileConfigs = async (files: FileList): Promise<ProcessedFile[]> => {
    return await Promise.all(
      Array.from(files).map(async (file) => {
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
                      ? extractPrecionFromGeohash(column.type)
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
            durable: false,
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

  const handleDrop = async (files: FileList) => {
    const fileConfigs = await getFileConfigs(files)
    setFilesDropped([...filesDropped, ...fileConfigs] as ProcessedFile[])
  }

  const handlePaste = (event: Event) => {
    const clipboardEvent = event as ClipboardEvent
    const files = clipboardEvent.clipboardData?.files
    if (files) {
      handleDrop(files)
    }
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

  useEffect(() => {
    window.addEventListener("paste", handlePaste)

    return () => {
      window.removeEventListener("paste", handlePaste)
    }
  }, [])

  return (
    <Box gap="4rem" flexDirection="column" ref={rootRef}>
      <DropBox onFilesDropped={handleDrop} />
      <FilesToUpload
        files={filesDropped}
        onFileUpload={async (filename) => {
          const file = filesDropped.find(
            (f) => f.table_name === filename,
          ) as ProcessedFile

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
                setFileProperties(file.table_name, {
                  uploadProgress: progress,
                })
              },
            })
            setFileProperties(file.table_name, {
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
                            ? extractPrecionFromGeohash(c.type)
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
            setFileProperties(file.table_name, {
              uploaded: false,
              uploadResult: undefined,
              uploadProgress: 0,
              error: "Upload error",
            })
          }
        }}
        onFileRemove={(filename) => {
          const file = filesDropped.find(
            (f) => f.table_name === filename,
          ) as ProcessedFile
          setFilesDropped(
            filesDropped.filter(
              (f) => f.fileObject.name !== file.fileObject.name,
            ),
          )
        }}
        onFilePropertyChange={async (filename, partialFile) => {
          const processedFiles = await Promise.all(
            filesDropped.map(async (file) => {
              if (file.fileObject.name === filename) {
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
    </Box>
  )
}
