import React, { useState } from "react"
import { ProcessedFile } from "./types"
import { Box, Button, Tooltip } from "../../../components"
import { Close, Upload2 } from "../../../components/icons"
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
        file={file}
      />
      <Button
        disabled={file.isUploading}
        data-hook="import-upload-button"
        variant="primary"
        prefixIcon={<Upload2 size="18px" />}
        onClick={() => onUpload(file.id)}
      >
        {file.isUploading ? "Uploading..." : "Upload"}
      </Button>
      <Tooltip placement="top" content="Remove file from queue">
        <Button
          disabled={file.isUploading}
          variant="secondary"
          onClick={() => {
            onRemove(file.id)
          }}
        >
          <Close size="18px" />
        </Button>
      </Tooltip>
    </Box>
  )
}
