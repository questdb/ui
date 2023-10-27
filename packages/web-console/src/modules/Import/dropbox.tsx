import React, { useContext, useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { Search2 } from "@styled-icons/remix-line"
import { ImportContext } from "./import-file"
import { Text } from "../../components"
import { Button, Box, Heading } from "@questdb/react-components"
import { QuestContext } from "../../providers"

const Root = styled(Box).attrs({ flexDirection: "column" })<{
  isDragging: boolean
}>`
  width: 100%;
  flex: 1;
  padding: 4rem 0 0;
  gap: 2rem;
  background: ${({ theme }) => theme.color.backgroundLighter};
  border: 3px dashed ${({ isDragging }) => (isDragging ? "#7f839b" : "#333543")};
  box-shadow: inset 0 0 10px 0 #1b1c23;
  transition: all 0.15s ease-in-out;
`

const Actions = styled(Box).attrs({ flexDirection: "column" })`
  margin: auto;
`

const Caution = styled.div`
  margin-top: auto;
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
// 25MB
const CHUNK_BYTE_OFFSET= 2.5e+7

const getFileChunk = (file: File, byteOffset: number) => {
  return new Promise((resolve, reject) => {
    const timeStart = performance.now()
    const reader = new FileReader()
    reader.onload = () => {
      const timeEnd = performance.now()
      console.info(`${file.name} split time: ${timeEnd - timeStart}ms`)
      resolve(reader.result)
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file.slice(0, byteOffset))
  })
}

export const DropBox = () => {
  const { dispatch } = useContext(ImportContext)
  const { quest } = useContext(QuestContext)
  const [isDragging, setIsDragging] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(e.type === "dragenter" || e.type === "dragover")
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    await onFileAdded(Array.from(e.dataTransfer.files)[0])
  }

  const handlePaste = async (event: Event) => {
    const clipboardEvent = event as ClipboardEvent
    const clipboardFiles = clipboardEvent.clipboardData?.files
    if (clipboardFiles) {
      await onFileAdded(Array.from(clipboardFiles)[0])
    }
  }

  const onFileAdded = async (file: File) => {
    const fileChunk =
      file.size > CHUNK_BYTE_OFFSET
        ? await (async () => {
            const chunk = await getFileChunk(file, CHUNK_BYTE_OFFSET)
            return new File([chunk as ArrayBuffer], file.name) as File
          })()
        : file
    dispatch({ step: "settings", file, fileChunk })
  }

  useEffect(() => {
    window.addEventListener("paste", handlePaste)

    return () => {
      window.removeEventListener("paste", handlePaste)
    }
  }, [])

  return (
    <Root
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      isDragging={isDragging}
    >
      <Actions>
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
            onFileAdded(Array.from(e.target.files)[0])
          }}
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
      </Actions>
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
