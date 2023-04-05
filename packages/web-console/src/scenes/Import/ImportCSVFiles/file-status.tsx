import React, { useEffect, useContext, useState } from "react"
import type { File } from "./types"
import { QuestContext } from "../../../providers"
import { FileStatus as FileStatusType } from "../../../utils"
import { Badge, BadgeType } from "@questdb/react-components"

const mapStatusToLabel = (
  status: FileStatusType | undefined,
): { label: string; type: BadgeType } | undefined => {
  if (!status) {
    return undefined
  }

  switch (status) {
    case FileStatusType.EXISTS:
      return {
        label: "File already uploaded",
        type: BadgeType.ERROR,
      }
      break
    case FileStatusType.DOES_NOT_EXIST:
      return {
        label: "Ready to upload",
        type: BadgeType.WARNING,
      }
  }
}

export const FileStatus = ({ file }: { file: File }) => {
  const { quest } = useContext(QuestContext)
  const [fileStatus, setFileStatus] = useState<FileStatusType>()

  const status = mapStatusToLabel(fileStatus)

  useEffect(() => {
    if (file) {
      void quest.checkCSVFile(file.name).then((result) => {
        if (result.status) {
          setFileStatus(result.status)
        }
      })
    }
  }, [file])

  return status ? <Badge type={status.type}>{status.label}</Badge> : <></>
}
