import React, { useState } from "react"
import { Box } from "../../../components/Box"
import { DropBox } from "./dropbox"
import { FilesToUpload } from "./files-to-upload"
import { ProcessedFile } from "./types"
import { useContext } from "react"
import { QuestContext } from "../../../providers"
import { pick, SchemaColumn, UploadResult } from "../../../utils"

type Props = {
  onImported: (result: UploadResult) => void
}

const filterCSVFiles = (files: FileList) => {
  return files
    ? Array.from(files).filter((file) => file.type === "text/csv")
    : []
}

export const ImportCSVFiles = ({ onImported }: Props) => {
  const { quest } = useContext(QuestContext)
  const [filesDropped, setFilesDropped] = useState<ProcessedFile[]>([])

  const getFileConfigs = async (files: FileList): Promise<ProcessedFile[]> => {
    const csvFiles = filterCSVFiles(files)
    return await Promise.all(
      csvFiles.map(async (file) => {
        const result = await quest.checkCSVFile(file.name)
        return {
          fileObject: file,
          table_name: file.name,
          status: result.status,
          schema: [],
          settings: {
            forceHeader: false,
            overwrite: false,
            skipLev: false,
            delimiter: "",
            atomicity: "skipCol",
            durable: false,
          },
          uploaded: false,
          uploadResult: undefined,
        }
      }),
    )
  }

  const handleDrop = async (files: FileList) => {
    const fileConfigs = await getFileConfigs(files)
    setFilesDropped([...filesDropped, ...fileConfigs] as ProcessedFile[])
  }

  return (
    <Box gap="4rem" flexDirection="column">
      <DropBox onFilesDropped={handleDrop} />
      <FilesToUpload
        files={filesDropped}
        onFileUpload={async (file) => {
          const response = await quest.uploadCSVFile({
            file: file.fileObject,
            name: file.table_name,
            settings: file.settings,
            schema: file.schema,
          })
          setFilesDropped(
            filesDropped.map((f) => {
              if (f.table_name === file.table_name) {
                return {
                  ...f,
                  uploaded: response.status === "OK",
                  uploadResult: response.status === "OK" ? response : undefined,
                  schema:
                    response.status === "OK"
                      ? response.columns.map(
                          (c) => pick(c, ["name", "type"]) as SchemaColumn,
                        )
                      : [],
                  error: response.status === "OK" ? undefined : response.status,
                }
              }
              return f
            }),
          )
          if (response.status === "OK") {
            onImported(response)
          }
        }}
        onFileRemove={(removedFile) => {
          setFilesDropped(
            filesDropped.filter(
              (f) => f.fileObject.name !== removedFile.fileObject.name,
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
