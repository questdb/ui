import React, { useEffect } from "react"
import styled from "styled-components"
import {
  Button,
  Heading,
  Switch,
  Table,
  Props as TableProps,
} from "@questdb/react-components"
import { PopperHover, Text, Tooltip } from "../../../components"
import { Box } from "../../../components/Box"
import { bytesWithSuffix } from "../../../utils/bytesWithSuffix"
import { FileStatus } from "./file-status"
import {
  Close,
  Edit,
  Information,
  Table as TableIcon,
  Upload2,
} from "styled-icons/remix-line"
import { FiletypeCsv } from "styled-icons/bootstrap"

const StyledTable = styled(Table)`
  width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0 2rem;

  tr {
    border-radius: ${({ theme }) => theme.borderRadius};
  }

  th {
    padding: 0 1rem;
  }

  td {
    padding: 1rem;
  }

  tbody tr {
    background: ${({ theme }) => theme.color.backgroundLighter};
  }
`

const File = styled(Box).attrs({
  align: "center",
})`
  gap: 1rem;
`

const FileDetails = styled(Box).attrs({
  align: "flex-start",
  flexDirection: "column",
})`
  gap: 0.5rem;
`

const EmptyState = styled(Box).attrs({ justifyContent: "center" })`
  width: 100%;
  background: ${({ theme }) => theme.color.backgroundLighter};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 1rem;
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
    <Box flexDirection="column" gap="2rem">
      <Heading level={3}>Upload queue</Heading>
      <StyledTable<React.FunctionComponent<TableProps<File>>>
        columns={[
          {
            header: "File",
            align: "flex-start",
            width: "40%",
            render: ({ data }) => (
              <File>
                <FiletypeCsv size="32px" />
                <FileDetails>
                  <Text color="foreground">{data.name}</Text>
                  <Text color="gray2">{bytesWithSuffix(data.size)}</Text>
                </FileDetails>
              </File>
            ),
          },
          {
            header: "Status",
            align: "flex-end",
            width: "200px",
            render: ({ data }) => <FileStatus file={data} />,
          },
          {
            header: "Table name",
            align: "flex-end",
            width: "200px",
            render: ({ data }) => (
              <Button skin="transparent" prefixIcon={<Edit size="14px" />}>
                {data.name}
              </Button>
            ),
          },
          {
            header: "Table schema",
            align: "flex-end",
            width: "200px",
            render: ({ data }) => (
              <Button skin="secondary" prefixIcon={<TableIcon size="18px" />}>
                Add table schema
              </Button>
            ),
          },
          {
            header: (
              <PopperHover
                placement="bottom"
                trigger={
                  <Box align="center" gap="0.5rem">
                    <Information size="14px" />
                    Force header
                  </Box>
                }
              >
                <Tooltip>
                  Enable in case of problems with automated header row detection
                </Tooltip>
              </PopperHover>
            ),
            align: "flex-end",
            width: "150px",
            render: ({ data }) => <Switch onChange={() => {}} />,
          },
          {
            header: "Actions",
            align: "flex-end",
            width: "200px",
            render: ({ data }) => (
              <Box gap="1rem" align="center">
                <Button skin="primary" prefixIcon={<Upload2 size="18px" />}>
                  Upload
                </Button>
                <PopperHover
                  placement="bottom"
                  trigger={
                    <Button
                      skin="secondary"
                      onClick={() => {
                        setCsvFileList(
                          csvFileList.filter((file) => file.name !== data.name),
                        )
                      }}
                    >
                      <Close size="18px" />
                    </Button>
                  }
                >
                  <Tooltip>Remove file from queue</Tooltip>
                </PopperHover>
              </Box>
            ),
          },
        ]}
        rows={csvFileList}
      />
      {csvFileList.length === 0 && (
        <EmptyState>
          <Text color="gray2" align="center">
            No files in queue
          </Text>
        </EmptyState>
      )}
    </Box>
  )
}
