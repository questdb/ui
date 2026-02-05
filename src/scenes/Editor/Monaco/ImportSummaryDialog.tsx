import React from "react"
import styled, { useTheme } from "styled-components"
import {
  Dialog,
  ForwardRef,
  Box,
  Button,
  Overlay,
  Text,
} from "../../../components"
import {
  WarningCircleIcon,
  UploadSimpleIcon,
  ChartLineIcon,
  CheckCircleIcon,
  FileTextIcon,
} from "@phosphor-icons/react"

export type SkippedTab = {
  label: string
  reason: string
  isMetricsTab?: boolean
  isExistingArchived?: boolean
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  importedCount: number
  skippedTabs: SkippedTab[]
}

const StyledDescription = styled(Dialog.Description)`
  display: grid;
  gap: 1.5rem;
`

const SkippedList = styled.div`
  max-height: 40vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`

const SkippedItem = styled(Box).attrs({
  align: "center",
  gap: "1rem",
})`
  padding: 1rem;
  background: ${({ theme }) => theme.color.backgroundLighter};
  border-radius: 0.4rem;
  border-left: 3px solid ${({ theme }) => theme.color.orange};
`

const TabLabel = styled(Text).attrs({
  color: "foreground",
  ellipsis: true,
})`
  flex: 1;
  min-width: 0;
`

const SummaryStats = styled(Box).attrs({
  gap: "2rem",
})`
  padding: 1rem;
  background: ${({ theme }) => theme.color.backgroundLighter};
  border-radius: 0.4rem;
`

const StatItem = styled(Box).attrs({
  align: "center",
  gap: "0.5rem",
})``

const BufferStatus = styled.span`
  color: ${({ theme }) => theme.color.gray2};
  font-size: 1rem;
  margin-left: 0.4rem;
  padding: 0.2rem 0.4rem;
  background: ${({ theme }) => theme.color.selection};
  border-radius: 0.2rem;
`

export const ImportSummaryDialog = ({
  open,
  onOpenChange,
  importedCount,
  skippedTabs,
}: Props) => {
  const theme = useTheme()

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <ForwardRef>
          <Overlay primitive={Dialog.Overlay} />
        </ForwardRef>
        <Dialog.Content
          maxwidth="64rem"
          data-hook="import-summary-dialog"
          onEscapeKeyDown={() => onOpenChange(false)}
        >
          <Dialog.Title>
            <Box gap="1rem">
              <UploadSimpleIcon size={20} />
              Import Summary
            </Box>
          </Dialog.Title>

          <StyledDescription>
            <SummaryStats>
              <StatItem>
                <CheckCircleIcon
                  size={20}
                  weight="fill"
                  color={theme.color.green}
                />
                <Text color="green" size="md">
                  {importedCount} tab{importedCount === 1 ? "" : "s"} imported
                </Text>
              </StatItem>
              <StatItem>
                <WarningCircleIcon
                  size={20}
                  weight="fill"
                  color={theme.color.orange}
                />
                <Text color="orange" size="md">
                  {skippedTabs.length} tab{skippedTabs.length === 1 ? "" : "s"}{" "}
                  skipped
                </Text>
              </StatItem>
            </SummaryStats>

            <SkippedList data-hook="import-summary-skipped-list">
              {skippedTabs.map((tab) => (
                <SkippedItem
                  key={`${tab.label}-${Math.random()}`}
                  data-hook="import-summary-skipped-item"
                >
                  {tab.isMetricsTab ? (
                    <ChartLineIcon size={18} color={theme.color.cyan} />
                  ) : (
                    <FileTextIcon size={18} color={theme.color.foreground} />
                  )}
                  <TabLabel title={tab.label}>{tab.label}</TabLabel>
                  {tab.isExistingArchived && (
                    <BufferStatus>closed</BufferStatus>
                  )}
                  <Text color="orange" size="sm">
                    {tab.reason}
                  </Text>
                </SkippedItem>
              ))}
            </SkippedList>
          </StyledDescription>

          <Dialog.ActionButtons>
            <Dialog.Close asChild>
              <Button
                skin="secondary"
                data-hook="import-summary-close"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </Dialog.Close>
          </Dialog.ActionButtons>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
