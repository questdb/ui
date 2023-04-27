import React from "react"
import { ProcessedFile } from "./types"
import {
  Dialog,
  ForwardRef,
  Overlay,
  Button,
  Table,
} from "@questdb/react-components"
import type { Props as TableProps } from "@questdb/react-components/dist/components/Table"
import { Search } from "styled-icons/remix-line"
import { Box } from "../../../components/Box"
import { Text } from "../../../components/Text"
import { Drawer } from "../../../components"
import styled from "styled-components"
import { Undo } from "styled-icons/boxicons-regular"
import { UploadResultColumn } from "../../../utils"

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

type Props = {
  file: ProcessedFile
}

export const UploadResultDialog = ({ file }: Props) => {
  const name = file.table_name ?? file.fileObject.name

  const stats = [
    {
      label: "Force header",
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

  return (
    <Drawer
      title={
        <Box>
          <Search size={20} />
          <Text color="foreground">Import details for {name}</Text>
        </Box>
      }
      trigger={
        <Button skin="success" prefixIcon={<Search size="14px" />}>
          Details
        </Button>
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
