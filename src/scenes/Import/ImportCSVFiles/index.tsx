import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { FilesToUpload } from "./files-to-upload"
import { ProcessedFile } from "./types"
import { SchemaColumn } from "../../../components/TableSchemaDialog/types"
import { useContext } from "react"
import { QuestContext } from "../../../providers"
import { pick, UploadResult, FileCheckStatus, Parameter } from "../../../utils"
import * as QuestDB from "../../../utils/questdb"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import { getTimestampFormat, isTimestamp } from "./utils"
import { MAX_UNCOMMITTED_ROWS } from "./const"
import { Box } from "../../../components"
import { useIsVisible } from "../../../hooks"
import {
  extractPrecionFromGeohash,
  isGeoHash,
  mapColumnTypeToQuestDB,
  mapColumnTypeToUI,
} from "./utils"
import { Upload } from "./upload"
import { getValue } from "../../../utils/localStorage"
import { StoreKey } from "../../../utils/localStorage/types"
import { authSessionState } from "../../../modules/OAuth2/authSessionState"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"

type State = "upload" | "list"

type Props = {
  onViewData: (result: UploadResult) => void
  onUpload: (result: UploadResult) => void
}

const Root = styled(Box).attrs({ gap: "4rem", flexDirection: "column" })`
  flex: 1;
`

export const ImportCSVFiles = ({ onViewData, onUpload }: Props) => {
  const { quest } = useContext(QuestContext)
  const [filesDropped, setFilesDropped] = useState<ProcessedFile[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const tables = useSelector(selectors.query.getTables)
  const rootRef = useRef<HTMLDivElement>(null)
  const isVisible = useIsVisible(rootRef)
  const [state, setState] = useState<State>("upload")
  const [ownedByList, setOwnedByList] = useState<string[]>([])

  const getOwnedByList = async () => {
    const isEE = getValue(StoreKey.RELEASE_TYPE) === "EE"
    if (!isEE) {
      // OSS does not have to set owner
      return
    }

    try {
      let ownedByNames: string[] = []
      const userResult = await quest.query<Parameter>(`select current_user()`, {
        background: true,
      })
      if (userResult.type === "dql" && userResult.count > 0) {
        const username = Object.values(userResult.data[0])[0] as string
        if (username) {
          const ssoAuthenticated = authSessionState.isSSOAuthenticated()
          if (!ssoAuthenticated) {
            // no OAuth2 payload, non-SSO users can set themselves as owner
            ownedByNames.push(username)
          }

          const result = await quest.query<Parameter>(
            `show groups '${username}'`,
            { background: true },
          )
          if (result.type === "dql" && result.count > 0) {
            const groups = result.data.map(
              (row) => Object.values(row)[0] as string,
            )
            ownedByNames = ownedByNames.concat(groups)
          }
        }
      }

      setOwnedByList(ownedByNames)
    } catch (ex) {
      return
    }
  }

  useEffect(() => {
    void getOwnedByList()
  }, [])

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
                    pattern: getTimestampFormat(column.type),
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
            ? (() => {
                const table = tables.find((t) => t.table_name === file.name)
                return table?.partitionBy ?? "NONE"
              })()
            : "NONE"

        const ttlValue =
          result.status === FileCheckStatus.EXISTS && tables
            ? (() => {
                const table = tables.find((t) => t.table_name === file.name)
                return table?.ttlValue ?? 0
              })()
            : 0

        const ttlUnit =
          result.status === FileCheckStatus.EXISTS && tables
            ? (() => {
                const table = tables.find((t) => t.table_name === file.name)
                return table?.ttlUnit ?? "HOURS"
              })()
            : "HOURS"

        const timestamp =
          result.status === FileCheckStatus.EXISTS && tables
            ? (() => {
                const table = tables.find((t) => t.table_name === file.name)
                return table?.designatedTimestamp ?? ""
              })()
            : ""

        return {
          id: crypto.randomUUID(),
          fileObject: file,
          table_name: file.name,
          table_owner: ownedByList[0],
          status: result.status,
          exists: result.status === FileCheckStatus.EXISTS,
          schema,
          partitionBy,
          ttlValue,
          ttlUnit,
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
    const checks = await Promise.all(
      filesDropped.map(async ({ id, table_name }) => {
        const { status } = await quest.checkCSVFile(table_name)
        return [id, { table_name, status }] as const
      }),
    )
    const checked = new Map(checks)
    // The checks can wait for a token refresh. Merge only their statuses into
    // the current list: files may have been uploaded, edited, added or removed
    // meanwhile, and a status is outdated once its file has been renamed.
    setFilesDropped((files) =>
      files.map((file) => {
        const check = checked.get(file.id)
        return check && check.table_name === file.table_name
          ? { ...file, status: check.status }
          : file
      }),
    )
  }

  useEffect(() => {
    if (isVisible) {
      void handleVisible()
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
          onViewData={onViewData}
          onFilesDropped={handleDrop}
          onDialogToggle={setDialogOpen}
          ownedByList={ownedByList}
          onFileUpload={async (id) => {
            const file = filesDropped.find((f) => f.id === id) as ProcessedFile

            if (file.isUploading) {
              return
            }
            void trackEvent(ConsoleEvent.IMPORT_FILE_UPLOAD, {
              fileSize: file.fileObject.size,
            })
            setIsUploading(file, true)
            try {
              const response = await quest.uploadCSVFile({
                file: file.fileObject,
                name: file.table_name,
                owner: file.table_owner,
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
                            pattern: isTimestamp(c.type)
                              ? match?.pattern
                                ? match?.pattern
                                : getTimestampFormat(c.type)
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
              setIsUploading(file, false)
              onUpload(response)
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
            const tableName = partialFile.table_name
            // Apply the edit at once: the name check below can wait for a
            // token refresh, and an upload started meanwhile must use the new
            // name. A new name also resets the prior error.
            setFileProperties(
              id,
              tableName ? { ...partialFile, error: undefined } : partialFile,
            )
            // Only check for file existence if table name is changed
            if (!tableName) return
            const { status } = await quest.checkCSVFile(tableName)
            setFilesDropped((files) =>
              files.map((file) =>
                // Ignore the result if the file has been renamed again.
                file.id === id && file.table_name === tableName
                  ? { ...file, status }
                  : file,
              ),
            )
          }}
        />
      )}
    </Root>
  )
}
