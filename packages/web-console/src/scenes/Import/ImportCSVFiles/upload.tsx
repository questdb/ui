import React, { useContext, useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { ProcessedFile } from "./types"
import { DropBox } from "./dropbox"
import { Search2 } from "@styled-icons/remix-line"
import { Box } from "../../../components/Box"
import { Text } from "@questdb/react-components"
import { Button, Heading } from "@questdb/react-components"
import { Parameter } from "../../../utils"
import { QuestContext } from "../../../providers"

const Actions = styled(Box).attrs({ flexDirection: "column", gap: "2rem" })`
  margin: auto;
`

const Info = styled.div`
  margin-top: 1rem;
  padding: 2rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
  border-radius: ${({ theme }) => theme.borderRadius};
  text-align: center;
`

const InfoText = styled(Text)`
  line-height: 1.75;
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

const CopySQLLink = () => (
  <a
    href="https://questdb.io/docs/guides/import-csv/#import-csv-via-copy-sql"
    target="_blank"
    rel="noopener noreferrer"
  >
    COPY
  </a>
)

export const Upload = ({ files, onFilesDropped, dialogOpen }: Props) => {
  const { quest } = useContext(QuestContext)
  const [copyEnabled, setCopyEnabled] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  const enableCopyIfParamExists = async () => {
    try {
      const result = await quest.query<Parameter>(
        `(show parameters) where property_path ilike 'cairo.sql.copy.root'`,
      )
      if (result.type === "dql" && result.count > 0) {
        setCopyEnabled(
          result.data[0].value !== null && result.data[0].value !== "null",
        )
      }
    } catch (ex) {
      return
    }
  }
  useEffect(() => {
    enableCopyIfParamExists()
  }, [])

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
              src="assets/upload.svg"
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
            <Info>
              {copyEnabled ? (
                <InfoText>
                  Suitable for small batches of CSV file upload.
                  <br />
                  For database migrations, we recommend the <CopySQLLink />{" "}
                  command.
                </InfoText>
              ) : (
                <InfoText>
                  Note: COPY SQL is not available for CSV Import on this
                  database. Refer <CopySQLLink /> to enable it.
                </InfoText>
              )}
            </Info>
          </Actions>
        </React.Fragment>
      )}
    />
  )
}
