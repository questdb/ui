import React, { useEffect } from "react"
import styled from "styled-components"
import { Button } from "@questdb/react-components"
import { bytesWithSuffix } from "../../../utils/bytesWithSuffix"
import { FileStatus } from "./file-status"
import { Table, Upload2 } from "styled-icons/remix-line"

const Root = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`

type Props = {
  files: FileList | null
}

const filterCSVFiles = (files: FileList | null): File[] => {
  return files
    ? Array.from(files).filter((file) => file.type === "text/csv")
    : []
}

export const FilesToUpload = ({ files }: Props) => {
  const [csvFileList, setCsvFileList] = React.useState<File[]>(
    filterCSVFiles(files),
  )

  useEffect(() => {
    if (files) {
      setCsvFileList([...csvFileList, ...filterCSVFiles(files)])
    }
  }, [files])

  return (
    <Root>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>File</th>
            <th>Status</th>
            <th>Table schema</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {csvFileList.map((file, index) => (
            <tr key={`${file.name}-${index}`}>
              <td></td>
              <td>
                {file.name}
                <br />
                {bytesWithSuffix(file.size)}
              </td>
              <td>
                <FileStatus file={file} />
              </td>
              <td>
                <Button prefixIcon={<Table size="18px" />}>
                  Add table schema
                </Button>
              </td>
              <td>
                <Button skin="primary" prefixIcon={<Upload2 size="18px" />}>
                  Upload
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Root>
  )
}
