import React from "react"
import { ProcessedFile } from "./types"
import type { TableProps } from "../../../components"
import { Search } from "../../../components/icons"
import { Text, Button, Box, Drawer, Table } from "../../../components"
import styled from "styled-components"
import { UploadResultColumn } from "../../../utils"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"

const SearchIcon = styled(Search)`
  color: ${({ theme }) => theme.color.contentPrimary};
`

const StyledTable = styled(Table)`
  width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0 2rem;
  padding: 0 2rem;

  th {
    padding: 0 1.5rem;
    color: ${({ theme }) => theme.color.contentPrimary};
  }

  td {
    padding: 1.5rem;
  }

  tbody td {
    background: ${({ theme }) => theme.color.surfaceRaised};

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
  background-color: ${({ theme }) => theme.color.statusDanger};
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
          <Text color="contentPrimary">Import details for {name}</Text>
        </Box>
      }
      trigger={
        <DetailsButton
          variant="success"
          prefixIcon={<Search size="14px" />}
          onClick={() => void trackEvent(ConsoleEvent.IMPORT_DETAILS_OPEN)}
        >
          {partialErrorsCount > 0 && <NotificationCircle />}
          Details
        </DetailsButton>
      }
      withCloseButton
    >
      <Drawer.ContentWrapper>
        {stats.map((stat) => (
          <Drawer.GroupItem key={stat.label} direction="column">
            <Stat>
              <Text color="contentSecondary">{stat.label}</Text>
              <Text color="contentPrimary">{stat.value}</Text>
            </Stat>
          </Drawer.GroupItem>
        ))}
        <Drawer.GroupHeader>
          <Text color="contentPrimary">Table schema</Text>
        </Drawer.GroupHeader>
        <StyledTable<React.FunctionComponent<TableProps<UploadResultColumn>>>
          columns={[
            {
              header: "Name",
              render: ({ data }) => (
                <Text color="contentPrimary">{data.name}</Text>
              ),
            },
            {
              header: "Type",
              align: "flex-end",
              render: ({ data }) => (
                <Text color="contentPrimary">{data.type}</Text>
              ),
            },
            {
              header: "Size",
              width: "100px",
              align: "flex-end",
              render: ({ data }) => (
                <Text color="contentPrimary">{data.size.toLocaleString()}</Text>
              ),
            },
            {
              header: "Errors",
              width: "100px",
              align: "flex-end",
              render: ({ data }) => (
                <Text
                  color={data.errors > 0 ? "statusDanger" : "contentPrimary"}
                >
                  {data.errors.toLocaleString()}
                </Text>
              ),
            },
          ]}
          rows={file.uploadResult?.columns ?? []}
        />
      </Drawer.ContentWrapper>
    </Drawer>
  )
}
