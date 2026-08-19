import React from "react"
import { ProcessedFile } from "./types"
import { Edit, InfoCircle, Undo } from "../../../components/icons"
import {
  Text,
  Box,
  Button,
  Form,
  ForwardRef,
  Overlay,
  Dialog,
} from "../../../components"
import Joi from "joi"
import { isValidTableName } from "../../../components/TableSchemaDialog/isValidTableName"
import styled from "styled-components"

const TableNameTrigger = styled(Button).attrs({ variant: "ghost" })`
  width: 100%;
  min-width: 0;
  justify-content: flex-start;
  padding-inline: 0.8rem;
`

const TriggerLabel = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const RenameDialogContent = styled(Dialog.Content)`
  padding: 0;
  overflow: hidden;
`

const RenameDialogTitle = styled(Dialog.Title)`
  padding: 1.6rem 2rem;
  background: ${({ theme }) => theme.color.surfaceRaised};
  border-bottom-color: ${({ theme }) => theme.color.borderSubtle};
  font-weight: 600;
`

const TitleIcon = styled(Edit)`
  color: ${({ theme }) => theme.color.contentAccent};
  flex-shrink: 0;
`

const List = styled.ul`
  display: grid;
  gap: 0.6rem;
  margin: 0;
  padding-left: 1.8rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: ${({ theme }) => theme.fontSize.sm};
  line-height: 1.5;

  li::marker {
    color: ${({ theme }) => theme.color.contentAccent};
  }

  strong {
    color: ${({ theme }) => theme.color.contentPrimary};
  }
`

const StyledDescription = styled(Dialog.Description)`
  display: grid;
  gap: 1.6rem;
  margin: 0;
  padding: 2rem;
`

const NamingRules = styled.div`
  display: grid;
  gap: 1rem;
  padding: 1.2rem 1.4rem;
  background: ${({ theme }) => theme.color.surfaceRaised};
  border: 1px solid ${({ theme }) => theme.color.borderSubtle};
  border-radius: 0.6rem;
`

const RulesHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const Actions = styled(Dialog.ActionButtons)`
  gap: 0.8rem;
  margin: 0;
  padding: 1.4rem 2rem;
  background: ${({ theme }) => theme.color.surfaceRaised};
  border-top: 1px solid ${({ theme }) => theme.color.borderSubtle};

  > button:not(:last-child) {
    margin-right: 0;
  }
`

type Props = {
  open: boolean
  onOpenChange: (file?: ProcessedFile) => void
  onNameChange: (name: string) => void
  file: ProcessedFile
}

const schema = Joi.object({
  name: Joi.string()
    .required()
    .custom((value: string, helpers) => {
      if (!isValidTableName(value)) {
        return helpers.error("string.validTableName")
      }
      return value
    })
    .messages({
      "string.empty": "Please enter a name",
      "string.validTableName": "Invalid table name",
    }),
})

export const RenameTableDialog = ({
  open,
  onOpenChange,
  onNameChange,
  file,
}: Props) => {
  const name = file.table_name ?? file.fileObject.name
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onOpenChange(undefined)
      }}
    >
      <Dialog.Trigger asChild>
        <TableNameTrigger
          prefixIcon={<Edit size="16px" />}
          onClick={() => onOpenChange(file)}
          title={name}
        >
          <TriggerLabel>{name}</TriggerLabel>
        </TableNameTrigger>
      </Dialog.Trigger>

      <Dialog.Portal>
        <ForwardRef>
          <Overlay primitive={Dialog.Overlay} />
        </ForwardRef>

        <RenameDialogContent>
          <Form<{ name: string }>
            name="rename-table"
            defaultValues={{ name }}
            onSubmit={(values) => {
              onNameChange(values.name)
              onOpenChange(undefined)
            }}
            validationSchema={schema}
          >
            <RenameDialogTitle>
              <Box align="center" gap="0.8rem">
                <TitleIcon size={20} />
                Change table name
              </Box>
            </RenameDialogTitle>

            <StyledDescription>
              <Form.Item name="name" label="Table name" required>
                <Form.Input name="name" autoComplete="off" autoFocus />
              </Form.Item>
              <NamingRules>
                <RulesHeader>
                  <InfoCircle size={16} />
                  <Text color="contentSecondary" size="sm" weight={600}>
                    Naming requirements
                  </Text>
                </RulesHeader>
                <List>
                  <li>Max 127 characters</li>
                  <li>Must not contain dot at the beginning</li>
                  <li>
                    Must not contain the following characters:{" "}
                    <strong>{`? , ' " \\ / : ) ( + * & ~ \r \n`}</strong>
                  </li>
                  <li>No control characters and UTF-8 BOM (Byte Order Mark)</li>
                  <li>
                    Cannot be named <strong>telemetry</strong> or{" "}
                    <strong>telemetry_config</strong>
                  </li>
                </List>
              </NamingRules>
            </StyledDescription>

            <Actions>
              <Dialog.Close asChild>
                <Button prefixIcon={<Undo size={18} />} variant="secondary">
                  Dismiss
                </Button>
              </Dialog.Close>

              <Form.Submit prefixIcon={<Edit size={18} />} variant="primary">
                Change
              </Form.Submit>
            </Actions>
          </Form>
        </RenameDialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
