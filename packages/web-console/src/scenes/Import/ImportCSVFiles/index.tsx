import React from "react"
import { Box } from "../../../components/Box"
import { DropBox } from "./dropbox"
import { FilesToUpload } from "./files-to-upload"
import { ProcessedFile } from "./types"
import { useContext } from "react"
import { QuestContext } from "../../../providers"

type Props = {
  onImported: () => void
}

const filterCSVFiles = (files: FileList) => {
  return files
    ? Array.from(files).filter((file) => file.type === "text/csv")
    : []
}

export const ImportCSVFiles = ({}: Props) => {
  const { quest } = useContext(QuestContext)
  const [filesDropped, setFilesDropped] = React.useState<ProcessedFile[]>([])

  const getFileConfigs = async (files: FileList) => {
    const csvFiles = filterCSVFiles(files)
    return await Promise.all(
      csvFiles.map(async (file) => {
        const result = await quest.checkCSVFile(file.name)
        return {
          fileObject: file,
          table_name: file.name,
          status: result.status ?? undefined,
          schema: undefined,
          forceHeader: false,
          overwrite: false,
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
          await quest.uploadCSVFile({
            file: file.fileObject,
            name: file.table_name ?? file.fileObject.name,
            forceHeader: file.forceHeader,
            overwrite: file.overwrite,
          })
          // onImported upwards
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
                  status: result.status ?? undefined,
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
