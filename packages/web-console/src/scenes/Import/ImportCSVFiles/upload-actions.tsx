import React, { useState } from "react"
import { ProcessedFile } from "./types"
import { Button } from "@questdb/react-components"
import { PopperHover, Tooltip } from "../../../components"
import { Box } from "../../../components/Box"
import { Close, Upload2 } from "@styled-icons/remix-line"
import { UploadSettingsDialog } from "./upload-settings-dialog"
import { UploadModeSettings } from "../../../utils"

type Props = {
  file: ProcessedFile
  onUpload: (filename: string) => void
  onRemove: (filename: string) => void
  onSettingsChange: (settings: UploadModeSettings) => void
}

export const UploadActions = ({
  file,
  onUpload,
  onRemove,
  onSettingsChange,
}: Props) => {
  const [settingsOpen, setSettingsOpen] = useState(false)
  return (
    <Box gap="1rem" align="center">
      <UploadSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSubmit={onSettingsChange}
        file={file as ProcessedFile}
      />
      <Button
        disabled={file.isUploading}
        data-hook="import-upload-button"
        skin="primary"
        prefixIcon={<Upload2 size="18px" />}
        onClick={() => onUpload(file.id)}
      >
        {file.isUploading ? "Uploading..." : "Upload"}
      </Button>
      <PopperHover
        placement="top"
        trigger={
          <Button
            disabled={file.isUploading}
            skin="secondary"
            onClick={() => {
              onRemove(file.id)
            }}
          >
            <Close size="18px" />
          </Button>
        }
      >
        <Tooltip>Remove file from queue</Tooltip>
      </PopperHover>
    </Box>
  )
}
