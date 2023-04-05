import React, { useRef, useState } from "react"
import styled from "styled-components"
import { Search2 } from "styled-icons/remix-line"
import { PrimaryButton, Text } from "../../../components"
import { Box } from "../../../components/Box"
import { Heading } from "@questdb/react-components"

const Root = styled(Box).attrs({ flexDirection: "column" })<{
  isDragging: boolean
}>`
  padding: 4rem 0 0;
  gap: 2rem;
  background: ${({ theme }) => theme.color.draculaBackground};
  border: 3px dashed ${({ isDragging }) => (isDragging ? "#5D6074" : "#333543")};
  box-shadow: inset 0 0 10px 0 #1b1c23;
  transition: all 0.15s ease-in-out;
`

const Caution = styled.div`
  margin-top: 2rem;
  padding: 2rem;
  width: 100%;
  background: ${({ theme }) => theme.color.draculaBackgroundDarker};
  text-align: center;
`

const CautionText = styled(Text)`
  color: #8b8fa7;

  a {
    color: ${({ theme }) => theme.color.draculaForeground};
  }
`

type Props = {
  onFilesDropped: (files: FileList) => void
}

export const DropBox = ({ onFilesDropped }: Props) => {
  const [isDragging, setIsDragging] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

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
    onFilesDropped(e.dataTransfer.files)
  }

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
      <Heading level={3}>Drag CSV files to upload</Heading>
      <input
        type="file"
        id="file"
        onChange={(e) => {
          onFilesDropped(e.target.files as FileList)
        }}
        multiple={true}
        ref={uploadInputRef}
        style={{ display: "none" }}
      />
      <PrimaryButton
        onClick={() => {
          uploadInputRef.current?.click()
        }}
      >
        <Search2 size="18px" />
        <span>Browse from disk</span>
      </PrimaryButton>
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
