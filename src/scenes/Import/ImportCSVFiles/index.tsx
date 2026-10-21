import React, { useCallback, useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { FilesToUpload } from "./files-to-upload"
import { ProcessedFile, TableNameCheck } from "./types"
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
  // Dropped files are listed once their table names are checked, which can
  // wait for a token refresh. Until then their names count as queued, so that
  // dropping one again is reported as a duplicate instead of importing it
  // twice. Kept here: the drop box is replaced when the list is first shown.
  const unlistedDrops = useRef(new Set<string[]>())
  const unlistedNames = useCallback(
    () => Array.from(unlistedDrops.current).flat(),
    [],
  )

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

  // The checks below can wait for a token refresh, and then fail. A failed
  // check must not lose the dropped file: list it with the failure shown, as
  // for a renamed file, and let the user still upload it.
  const checkTableName = async (name: string) => {
    try {
      return (await quest.checkCSVFile(name)).status
    } catch {
      return TableNameCheck.FAILED
    }
  }

  // The schema of an existing table only pre-fills the schema dialog.
  // Without it, QuestDB infers the schema from the file, as for a new table.
  const getExistingTableSchema = async (
    name: string,
  ): Promise<SchemaColumn[]> => {
    try {
      const columnResponse = await quest.showColumns(name)
      if (columnResponse && columnResponse.type === QuestDB.Type.DQL) {
        return columnResponse.data.map((column) => ({
          name: column.column,
          type: mapColumnTypeToUI(column.type),
          pattern: getTimestampFormat(column.type),
          precision: isGeoHash(column.type)
            ? extractPrecionFromGeohash(column.type)
            : "",
        }))
      }
    } catch {
      // Keep the file, without a pre-filled schema.
    }
    return []
  }

  const getFileConfigs = async (files: File[]): Promise<ProcessedFile[]> => {
    return await Promise.all(
      files.map(async (file) => {
        const status = await checkTableName(file.name)

        const schema =
          status === FileCheckStatus.EXISTS
            ? await getExistingTableSchema(file.name)
            : []

        const partitionBy =
          status === FileCheckStatus.EXISTS && tables
            ? (() => {
                const table = tables.find((t) => t.table_name === file.name)
                return table?.partitionBy ?? "NONE"
              })()
            : "NONE"

        const ttlValue =
          status === FileCheckStatus.EXISTS && tables
            ? (() => {
                const table = tables.find((t) => t.table_name === file.name)
                return table?.ttlValue ?? 0
              })()
            : 0

        const ttlUnit =
          status === FileCheckStatus.EXISTS && tables
            ? (() => {
                const table = tables.find((t) => t.table_name === file.name)
                return table?.ttlUnit ?? "HOURS"
              })()
            : "HOURS"

        const timestamp =
          status === FileCheckStatus.EXISTS && tables
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
          status,
          exists: status === FileCheckStatus.EXISTS,
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
    const names = files.map((file) => file.name)
    unlistedDrops.current.add(names)
    try {
      const fileConfigs = await getFileConfigs(files)
      setFilesDropped((filesDropped) => [...filesDropped, ...fileConfigs])
      setState("list")
    } finally {
      // React 17 has rendered the list already, as it renders updates outside
      // event handlers at once: the drop box counts the files as listed.
      unlistedDrops.current.delete(names)
    }
  }

  const handleVisible = async () => {
    const checks = await Promise.all(
      filesDropped.map(async ({ id, table_name }) => {
        try {
          const { status } = await quest.checkCSVFile(table_name)
          return [[id, { table_name, status }] as const]
        } catch {
          // A failed recheck says nothing new: keep the file's status.
          return []
        }
      }),
    )
    const checked = new Map(checks.flat())
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
          unlistedNames={unlistedNames}
          onFilesDropped={handleDrop}
          dialogOpen={dialogOpen}
        />
      )}

      {state === "list" && (
        <FilesToUpload
          dialogOpen={dialogOpen}
          files={filesDropped}
          unlistedNames={unlistedNames}
          onViewData={onViewData}
          onFilesDropped={handleDrop}
          onDialogToggle={setDialogOpen}
          ownedByList={ownedByList}
          onFileUpload={async (id) => {
            const file = filesDropped.find((f) => f.id === id) as ProcessedFile

            if (file.isUploading || file.status === TableNameCheck.PENDING) {
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
            // token refresh. The previous status described another table, so
            // the new name has no status, and can't be uploaded to, until its
            // check answers. A new name also resets the prior error.
            setFileProperties(
              id,
              tableName
                ? {
                    ...partialFile,
                    error: undefined,
                    status: TableNameCheck.PENDING,
                  }
                : partialFile,
            )
            // Only check for file existence if table name is changed
            if (!tableName) return
            let status: string
            try {
              status = (await quest.checkCSVFile(tableName)).status
            } catch {
              status = TableNameCheck.FAILED
            }
            setFilesDropped((files) =>
              files.map((file) =>
                // Ignore the result if the file has been renamed again. A
                // failure doesn't replace a status found by another check.
                file.id === id &&
                file.table_name === tableName &&
                (status !== TableNameCheck.FAILED ||
                  file.status === TableNameCheck.PENDING)
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
