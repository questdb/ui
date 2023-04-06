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
        onFilePropertyChange={(filename, partialFile) => {
          setFilesDropped(
            filesDropped.map((file) =>
              file.fileObject.name === filename
                ? { ...file, ...partialFile }
                : file,
            ),
          )
        }}
      />
    </Box>
  )
}
