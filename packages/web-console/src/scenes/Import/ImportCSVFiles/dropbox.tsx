import React, { useRef, useState, useEffect } from "react"
import styled from "styled-components"
import { Search2 } from "@styled-icons/remix-line"
import { Box } from "../../../components/Box"
import { Text } from "@questdb/react-components"
import { Button, Heading } from "@questdb/react-components"
import { ProcessedFile } from "./types"

const getFileDuplicates = (
  inputFiles: FileList,
  existingFileNames: string[],
) => {
  const duplicates = Array.from(inputFiles).filter((f) =>
    existingFileNames.includes(f.name),
  )
  return duplicates
}

const Root = styled(Box).attrs({ flexDirection: "column" })<{
  isDragging: boolean
}>`
  width: 100%;
  padding: 4rem 0 0;
  gap: 2rem;
  background: ${({ theme }) => theme.color.backgroundLighter};
  border: 3px dashed ${({ isDragging }) => (isDragging ? "#7f839b" : "#333543")};
  box-shadow: inset 0 0 10px 0 #1b1c23;
  transition: all 0.15s ease-in-out;
`

const Caution = styled.div`
  margin-top: 2rem;
  padding: 2rem;
  width: 100%;
  background: ${({ theme }) => theme.color.backgroundDarker};
  text-align: center;
`

const CautionText = styled(Text)`
  color: #8b8fa7;

  a {
    color: ${({ theme }) => theme.color.foreground};
  }
`

type Props = {
  files: ProcessedFile[]
  onFilesDropped: (files: File[]) => void
  dialogOpen: boolean
}

export const DropBox = ({ files, onFilesDropped, dialogOpen }: Props) => {
  const [isDragging, setIsDragging] = useState(false)
  const [duplicates, setDuplicates] = useState<File[]>([])
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const filenames = useRef<string[]>(files.map((f) => f.table_name))

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(
      e.type === "dragenter" || e.type === "dragover" ? true : false,
    )
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    addToQueue(e.dataTransfer.files)
  }

  const addToQueue = (inputFiles: FileList) => {
    const duplicates = getFileDuplicates(inputFiles, filenames.current)
    setDuplicates(duplicates)
    onFilesDropped(
      Array.from(inputFiles).filter((f) => !duplicates.includes(f)),
    )
    uploadInputRef.current?.setAttribute("value", "")
  }

  const handlePaste = (event: Event) => {
    const clipboardEvent = event as ClipboardEvent
    const clipboardFiles = clipboardEvent.clipboardData?.files
    if (clipboardFiles) {
      addToQueue(clipboardFiles)
    }
  }

  useEffect(() => {
    return () => {
      window.removeEventListener("paste", handlePaste)
    }
  }, [])

  useEffect(() => {
    if (dialogOpen) {
      window.removeEventListener("paste", handlePaste)
    } else {
      window.addEventListener("paste", handlePaste)
    }
  }, [dialogOpen])

  useEffect(() => {
    filenames.current = files.map((f) => f.table_name)
  }, [files])

  return (
    <Root
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      isDragging={isDragging}
    >
      <img
        alt="File upload icon"
        width="60"
        height="80"
        src="/assets/upload.svg"
      />
      <Heading level={3}>Drag CSV files here or paste from clipboard</Heading>
      <input
        type="file"
        id="file"
        onChange={(e) => {
          if (e.target.files === null) return
          addToQueue(e.target.files)
        }}
        multiple={true}
        ref={uploadInputRef}
        style={{ display: "none" }}
        value=""
      />
      <Button
        onClick={() => {
          uploadInputRef.current?.click()
        }}
        prefixIcon={<Search2 size="18px" />}
        skin="secondary"
      >
        Browse from disk
      </Button>
      {duplicates.length > 0 && (
        <Text color="red">
          File{duplicates.length > 1 ? "s" : ""} already added to queue:{" "}
          {duplicates.map((f) => f.name).join(", ")}. Change target table name
          and try again.
        </Text>
      )}
      <Caution>
        <CautionText>
          Suitable for small batches of CSV file upload. For database
          migrations, we recommend the{" "}
          <a
            href="https://questdb.io/docs/guides/importing-data"
            target="_blank"
            rel="noopener noreferrer"
          >
            COPY SQL
          </a>{" "}
          command.
        </CautionText>
      </Caution>
    </Root>
  )
}
