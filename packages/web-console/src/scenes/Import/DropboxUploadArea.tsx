import React from "react"
import { Button, Heading, Text } from "@questdb/react-components"
import { Box } from "../../components/Box"
import { Upload2 } from "@styled-icons/remix-line"
import styled from "styled-components"

const BrowseTextLink = styled.span`
  text-decoration: underline;
  cursor: pointer;

  &:hover {
    text-decoration: none;
  }
`

type Props = {
  title: string
  accept: string
  uploadInputRef: React.RefObject<HTMLInputElement>
  addToQueue: (inputFiles: FileList) => void
  duplicates: File[]
  mode?: "initial" | "list"
  children?: React.ReactNode
}

export const DropboxUploadArea = ({ 
  title, 
  accept,
  uploadInputRef,
  addToQueue,
  duplicates,
  mode = "initial",
  children 
}: Props) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addToQueue(e.target.files)
      e.target.value = ""
    }
  }

  return (
    <>
      <input
        ref={uploadInputRef}
        type="file"
        id="file"
        accept={accept}
        onChange={handleFileChange}
        multiple
        style={{ display: "none" }}
      />
      
      {mode === "initial" ? (
        <Box flexDirection="column" gap="4rem" align="center" justifyContent="center" style={{ flex: 1 }}>
          <Box flexDirection="column" gap="2rem" align="center">
            <Upload2 size="64px" color="#999" />
            <Heading level={3}>
              {title}
            </Heading>
          </Box>
          <Button 
            skin="primary" 
            onClick={() => uploadInputRef.current?.click()}
            data-hook="import-browse-from-disk"
          >
            Select files
          </Button>
          {duplicates.length > 0 && (
            <Text color="red">
              File{duplicates.length > 1 ? "s" : ""} already added to queue:{" "}
              {duplicates.map((f) => f.name).join(", ")}. Change target table
              name and try again.
            </Text>
          )}
          {children}
        </Box>
      ) : (
        <>
          <Text color="foreground">
            You can drag and drop more files or{" "}
            <BrowseTextLink onClick={() => uploadInputRef.current?.click()}>
              browse from disk
            </BrowseTextLink>
          </Text>
          {duplicates.length > 0 && (
            <Text color="red">
              File{duplicates.length > 1 ? "s" : ""} already added to queue:{" "}
              {duplicates.map((f) => f.name).join(", ")}. Change import name
              and try again.
            </Text>
          )}
        </>
      )}
    </>
  )
}