import React from "react"
import {
  Dialog,
  ForwardRef,
  Button,
  Overlay,
  Box,
  Text,
} from "@questdb/react-components"
import styled from "styled-components"
import { AutoAwesome } from "@styled-icons/material"
import { Check } from "@styled-icons/boxicons-regular"
import { TableSchemaExplanation } from "../../../utils/claude"

const StyledDialogContent = styled(Dialog.Content)`
  max-width: 800px;
  max-height: 80vh;
`

const StyledDescription = styled(Dialog.Description)`
  display: flex;
  flex-direction: column;
  gap: 2rem;
  overflow-y: auto;
  padding-right: 1rem;
  max-height: 60vh;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: ${({ theme }) => theme.color.gray1};
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.color.gray2};
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: ${({ theme }) => theme.color.gray2};
  }
`

const ExplanationText = styled(Text)`
  white-space: pre-wrap;
  line-height: 1.6;
  font-size: 1.4rem;
`

const TitleIcon = styled(Box)`
  display: flex;
  align-items: center;
  gap: 1rem;
`

const AIBadge = styled(Box)`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: ${({ theme }) => theme.color.purple}20;
  color: ${({ theme }) => theme.color.purple};
  padding: 0.2rem 0.8rem;
  border-radius: 0.4rem;
  font-size: 1.2rem;
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`

const SectionTitle = styled(Text)`
  font-weight: 600;
  font-size: 1.6rem;
  color: ${({ theme }) => theme.color.foreground};
  margin-bottom: 0.5rem;
`

const ColumnsTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 1.3rem;
  
  th {
    text-align: left;
    padding: 0.8rem;
    color: ${({ theme }) => theme.color.foreground};
    font-weight: 700;
    border-bottom: 1px solid ${({ theme }) => theme.color.gray2};
  }
  
  td {
    padding: 0.8rem;
    border-bottom: 1px solid ${({ theme }) => theme.color.gray1};
    &:nth-child(1), &:nth-child(2) {
      padding-right: 1.5rem;
    }
  }
  
  tbody tr:hover {
    background: ${({ theme }) => theme.color.gray1}20;
  }
`

const DataTypeCell = styled.td`
  font-family: ${({ theme }) => theme.fontMonospace};
  color: ${({ theme }) => theme.color.cyan};
`

const StorageList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`

const StorageDetail = styled.li`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  color: ${({ theme }) => theme.color.foreground};
  font-size: 1.4rem;
  margin-bottom: 0.8rem;
  
  &:last-child {
    margin-bottom: 0;
  }
`

const CheckIcon = styled(Check)`
  color: ${({ theme }) => theme.color.cyan};
  flex-shrink: 0;
  margin-top: 0.2rem;
`

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tableName: string
  explanation: TableSchemaExplanation | null
}

export const SchemaExplanationDialog = ({
  open,
  onOpenChange,
  tableName,
  explanation,
}: Props) => {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <ForwardRef>
          <Overlay primitive={Dialog.Overlay} />
        </ForwardRef>

        <StyledDialogContent
          data-hook="schema-explanation-dialog"
          onClick={(e: React.MouseEvent<HTMLDivElement>) => {
            e.stopPropagation()
          }}
          onEscapeKeyDown={() => onOpenChange(false)}
          onPointerDownOutside={() => onOpenChange(false)}
        >
          <Dialog.Title>
            <TitleIcon>
              {tableName}
              <AIBadge>
                <AutoAwesome size={14} />
                AI Explanation
              </AIBadge>
            </TitleIcon>
          </Dialog.Title>

          <StyledDescription>
            {explanation && (
              <>
                {explanation.explanation && (
                  <Section>
                    <SectionTitle>Overview</SectionTitle>
                    <ExplanationText color="foreground">
                      {explanation.explanation}
                    </ExplanationText>
                  </Section>
                )}
                
                {explanation.columns && explanation.columns.length > 0 && (
                  <Section>
                    <SectionTitle>Columns</SectionTitle>
                    <ColumnsTable>
                      <thead>
                        <tr>
                          <th>Column Name</th>
                          <th>Data Type</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {explanation.columns.map((column, index) => (
                          <tr key={index}>
                            <td>{column.name}</td>
                            <DataTypeCell>{column.data_type}</DataTypeCell>
                            <td>{column.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </ColumnsTable>
                  </Section>
                )}
                
                {explanation.storage_details && explanation.storage_details.length > 0 && (
                  <Section>
                    <SectionTitle>Storage Details</SectionTitle>
                    <StorageList>
                      {explanation.storage_details.map((detail, index) => (
                        <StorageDetail key={index}>
                          <CheckIcon size={16} />
                          <span>{detail}</span>
                        </StorageDetail>
                      ))}
                    </StorageList>
                  </Section>
                )}
              </>
            )}
          </StyledDescription>

          <Dialog.ActionButtons>
            <Dialog.Close asChild>
              <Button
                skin="secondary"
                data-hook="schema-explanation-dialog-close"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </Dialog.Close>
          </Dialog.ActionButtons>
        </StyledDialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}