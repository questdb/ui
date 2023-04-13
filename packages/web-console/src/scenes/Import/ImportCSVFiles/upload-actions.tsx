import React from "react"
import { ProcessedFile, WriteMode } from "./types"
import { Button, Select } from "@questdb/react-components"
import { PopperHover, Tooltip } from "../../../components"
import { Box } from "../../../components/Box"
import { Close, Upload2 } from "styled-icons/remix-line"
import { FileCheckStatus } from "../../../utils"

type Props = {
  file: ProcessedFile
  onUpload: (file: ProcessedFile) => void
  onModeChange: (mode: WriteMode) => void
  onRemove: (file: ProcessedFile) => void
}

export const UploadActions = ({
  file,
  onUpload,
  onModeChange,
  onRemove,
}: Props) => (
  <Box gap="1rem" align="center">
    {file.status === FileCheckStatus.EXISTS && (
      <Select
        name="write_type"
        defaultValue="append"
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
          onModeChange(e.target.value as WriteMode)
        }
        options={[
          {
            label: "Append",
            value: "append",
          },
          {
            label: "Overwrite",
            value: "overwrite",
          },
        ]}
      />
    )}
    <Button
      skin="primary"
      prefixIcon={<Upload2 size="18px" />}
      onClick={() => onUpload(file)}
    >
      Upload
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
