import React from "react"
import { ProcessedFile } from "./types"
import {
  AlertDialog,
  ForwardRef,
  Button,
  Overlay,
} from "@questdb/react-components"
import { Edit } from "styled-icons/remix-line"
import { Undo } from "styled-icons/boxicons-regular"
import { Text } from "../../../components/Text"
import { Form } from "../../../components/Form"
import Joi from "joi"
import { isValidTableName } from "./isValidTableName"
import styled from "styled-components"

const List = styled.ul`
  list-style-position: inside;
  padding-left: 0;

  li {
    margin-bottom: 1rem;
  }
`

const StyledDescription = styled(AlertDialog.Description)`
  display: grid;
  gap: 2rem;
`

type Props = {
  open: boolean
  onOpenChange: (openedFileName: string | undefined) => void
  onNameChange: (name: string) => void
  file: ProcessedFile
}

const schema = Joi.object({
  name: Joi.string()
    .required()
    .custom((value, helpers) => {
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
    <AlertDialog.Root open={open}>
      <AlertDialog.Trigger asChild>
        <ForwardRef>
          <Button
            skin="transparent"
            prefixIcon={<Edit size="14px" />}
            onClick={() => onOpenChange(name)}
          >
            {name}
          </Button>
        </ForwardRef>
      </AlertDialog.Trigger>

      <AlertDialog.Portal>
        <ForwardRef>
          <Overlay primitive={AlertDialog.Overlay} />
        </ForwardRef>

        <Form<{ name: string }>
          name="rename-table"
          defaultValues={{ name }}
          onSubmit={(values) => {
            onNameChange(values.name)
            onOpenChange(undefined)
          }}
          validationSchema={schema}
        >
          <AlertDialog.Content>
            <AlertDialog.Title>Rename table</AlertDialog.Title>

            <StyledDescription>
              <Form.Item name="name" label="Table name">
                <Form.Input name="name" />
              </Form.Item>
              <Text color="foreground">
                <List>
                  <li>Max 127 characters</li>
                  <li>Must not contain dot at the beginning</li>
                  <li>
                    Must not contain the following characters:{" "}
                    <strong>{`? , ' " \\ / : ) ( + * & ~ \r \n`}</strong>
                  </li>
                  <li>No control characters and UTF-8 BOM (Byte Order Mark)</li>
                </List>
              </Text>
            </StyledDescription>

            <AlertDialog.ActionButtons>
              <AlertDialog.Cancel asChild>
                <Button
                  prefixIcon={<Undo size={18} />}
                  skin="secondary"
                  onClick={() => onOpenChange(undefined)}
                >
                  Dismiss
                </Button>
              </AlertDialog.Cancel>

              <AlertDialog.Action asChild>
                <ForwardRef>
                  <Form.Submit
                    prefixIcon={<Edit size={18} />}
                    variant="success"
                  >
                    Change
                  </Form.Submit>
                </ForwardRef>
              </AlertDialog.Action>
            </AlertDialog.ActionButtons>
          </AlertDialog.Content>
        </Form>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
