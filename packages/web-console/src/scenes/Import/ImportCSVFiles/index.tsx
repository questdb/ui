import React from "react"
import { Box } from "../../../components/Box"
import { DropBox } from "./dropbox"
import { FilesToUpload } from "./files-to-upload"

type Props = {
  onImported: () => void
}

export const ImportCSVFiles = ({}: Props) => {
  const [filesDropped, setFilesDropped] = React.useState<FileList | null>(null)

  return (
    <Box gap="4rem" flexDirection="column">
      <DropBox onFilesDropped={setFilesDropped} />
      <FilesToUpload files={filesDropped} />
    </Box>
  )
}
