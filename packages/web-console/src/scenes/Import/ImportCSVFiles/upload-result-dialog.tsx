import React from "react"
import { ProcessedFile } from "./types"
import { Button, Table } from "@questdb/react-components"
import type { Props as TableProps } from "@questdb/react-components/dist/components/Table"
import { Search } from "@styled-icons/remix-line"
import { Box } from "../../../components/Box"
import { Text } from "../../../components/Text"
import { Drawer } from "../../../components"
import styled from "styled-components"
import { UploadResultColumn } from "../../../utils"

const SearchIcon = styled(Search)`
  color: ${({ theme }) => theme.color.foreground};
`

const StyledTable = styled(Table)`
  width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0 2rem;
  padding: 0 2rem;

  th {
    padding: 0 1.5rem;
    color: ${({ theme }) => theme.color.foreground};
  }

  td {
    padding: 1.5rem;
  }

  tbody td {
    background: ${({ theme }) => theme.color.backgroundLighter};

    &:first-child {
      border-top-left-radius: ${({ theme }) => theme.borderRadius};
      border-bottom-left-radius: ${({ theme }) => theme.borderRadius};
    }

    &:last-child {
      border-top-right-radius: ${({ theme }) => theme.borderRadius};
      border-bottom-right-radius: ${({ theme }) => theme.borderRadius};
    }
  }
`

const Stat = styled(Box).attrs({
  justifyContent: "space-between",
  gap: "2rem",
})`
  width: 100%;
`

const DetailsButton = styled(Button)`
  position: relative;
`

const NotificationCircle = styled.span`
  position: absolute;
  right: -0.4rem;
  top: -0.4rem;
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 50%;
  background-color: ${({ theme }) => theme.color.red};
`

type Props = {
  file: ProcessedFile
}

export const UploadResultDialog = ({ file }: Props) => {
  const name = file.table_name ?? file.fileObject.name

  const stats = [
    {
      label: "Header forced",
      value: file.uploadResult?.header.toString(),
    },
    {
      label: "Table name",
      value: file.uploadResult?.location,
    },
    {
      label: "Imported rows",
      value: file.uploadResult?.rowsImported.toLocaleString(),
    },
    {
      label: "Rejected rows",
      value: file.uploadResult?.rowsRejected.toLocaleString(),
    },
  ]

  const partialErrorsCount =
    file.uploadResult?.columns.reduce(
      (acc, column) => acc + column.errors,
      0,
    ) ?? 0

  return (
    <Drawer
      title={
        <Box>
          <SearchIcon size={20} />
          <Text color="foreground">Import details for {name}</Text>
        </Box>
      }
      trigger={
        <DetailsButton skin="success" prefixIcon={<Search size="14px" />}>
          {partialErrorsCount > 0 && <NotificationCircle />}
          Details
        </DetailsButton>
      }
      withCloseButton
    >
      <Box flexDirection="column" gap="0">
        {stats.map((stat) => (
          <Drawer.GroupItem key={stat.label} direction="column">
            <Stat>
              <Text color="gray2">{stat.label}</Text>
              <Text color="foreground">{stat.value}</Text>
            </Stat>
          </Drawer.GroupItem>
        ))}
        <Drawer.GroupHeader>
          <Text color="foreground">Table schema</Text>
        </Drawer.GroupHeader>
        <StyledTable<React.FunctionComponent<TableProps<UploadResultColumn>>>
          columns={[
            {
              header: "Name",
              render: ({ data }) => <Text color="foreground">{data.name}</Text>,
            },
            {
              header: "Type",
              align: "flex-end",
              render: ({ data }) => <Text color="foreground">{data.type}</Text>,
            },
            {
              header: "Size",
              width: "100px",
              align: "flex-end",
              render: ({ data }) => (
                <Text color="foreground">{data.size.toLocaleString()}</Text>
              ),
            },
            {
              header: "Errors",
              width: "100px",
              align: "flex-end",
              render: ({ data }) => (
                <Text color={data.errors > 0 ? "red" : "foreground"}>
                  {data.errors.toLocaleString()}
                </Text>
              ),
            },
          ]}
          rows={file.uploadResult?.columns ?? []}
        />
      </Box>
    </Drawer>
  )
}
