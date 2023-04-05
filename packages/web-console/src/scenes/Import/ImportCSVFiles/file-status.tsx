import React, { useEffect, useContext, useState } from "react"
import type { File } from "./types"
import { QuestContext } from "../../../providers"
import { FileStatus as FileStatusType } from "../../../utils"

const mapStatusToLabel = (status: FileStatusType) => {
  switch (status) {
    case FileStatusType.EXISTS:
      return "File exists"
      break
    case FileStatusType.DOES_NOT_EXIST:
      return "Ready to upload"
  }
}

export const FileStatus = ({ file }: { file: File }) => {
  const { quest } = useContext(QuestContext)
  const [fileStatus, setFileStatus] = useState<FileStatusType>()

  useEffect(() => {
    if (file) {
      void quest.checkCSVFile(file.name).then((result) => {
        if (result.status) {
          setFileStatus(result.status)
        }
      })
    }
  }, [file])

  return <div>{fileStatus && mapStatusToLabel(fileStatus)}</div>
}
