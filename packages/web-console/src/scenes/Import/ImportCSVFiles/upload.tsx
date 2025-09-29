import React, { useContext, useEffect, useState } from "react"
import styled from "styled-components"
import { ProcessedFile } from "./types"
import { Dropbox } from "../Dropbox"
import { DropboxUploadArea } from "../DropboxUploadArea"
import { Text } from "@questdb/react-components"
import { Parameter } from "../../../utils"
import { QuestContext } from "../../../providers"


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
    <Dropbox
      existingFileNames={files.map(f => f.table_name)}
      onFilesDropped={onFilesDropped}
      dialogOpen={dialogOpen}
      render={({ duplicates, addToQueue, uploadInputRef }) => (
        <DropboxUploadArea
          title="Drag CSV files here or paste from clipboard"
          accept=".csv"
          uploadInputRef={uploadInputRef}
          addToQueue={addToQueue}
          duplicates={duplicates}
          mode="initial"
        >
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
        </DropboxUploadArea>
      )}
    />
  )
}
