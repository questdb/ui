import React, { useState } from "react"
import { ProcessedFile } from "./types"
import { Button } from "@questdb/react-components"
import { PopperHover, Tooltip } from "../../../components"
import { Box } from "../../../components/Box"
import { Close, Upload2 } from "styled-icons/remix-line"
import { UploadSettingsDialog } from "./upload-settings-dialog"
import { UploadModeSettings } from "../../../utils"

type Props = {
  file: ProcessedFile
  onUpload: (file: ProcessedFile) => void
  onRemove: (file: ProcessedFile) => void
  onSettingsChange: (settings: UploadModeSettings) => void
  isUploading: boolean
}

export const UploadActions = ({
  file,
  onUpload,
  onRemove,
  onSettingsChange,
  isUploading,
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
        skin="primary"
        prefixIcon={<Upload2 size="18px" />}
        onClick={() => onUpload(file)}
      >
        {isUploading ? "Uploading..." : "Upload"}
      </Button>
      <PopperHover
        placement="bottom"
        trigger={
          <Button
            skin="secondary"
            onClick={() => {
              onRemove(file)
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
