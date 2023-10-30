import React, { useRef } from "react"
import styled from "styled-components"
import { ProcessedFile } from "./types"
import { DropBox } from "./dropbox"
import { Search2 } from "@styled-icons/remix-line"
import { Box } from "../../../components/Box"
import { Text } from "@questdb/react-components"
import { Button, Heading } from "@questdb/react-components"

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

type Props = {
  files: ProcessedFile[]
  onFilesDropped: (files: File[]) => void
  dialogOpen: boolean
}
export const Upload = ({ files, onFilesDropped, dialogOpen }: Props) => {
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <DropBox
      files={files}
      onFilesDropped={onFilesDropped}
      dialogOpen={dialogOpen}
      render={({ duplicates, addToQueue }) => (
        <React.Fragment>
          <Actions>
            <img
              alt="File upload icon"
              width="60"
              height="80"
              src="/assets/upload.svg"
            />
            <Heading level={3}>
              Drag CSV files here or paste from clipboard
            </Heading>
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
                {duplicates.map((f) => f.name).join(", ")}. Change target table
                name and try again.
              </Text>
            )}
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
        </React.Fragment>
      )}
    />
  )
}
