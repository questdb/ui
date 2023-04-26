import React from "react"
import { ProcessedFile } from "./types"
import { Dialog, ForwardRef, Button, Overlay } from "@questdb/react-components"
import { Edit } from "styled-icons/remix-line"
import { Undo } from "styled-icons/boxicons-regular"
import { Text } from "../../../components/Text"
import { Form } from "../../../components/Form"
import { Box } from "../../../components/Box"
import Joi from "joi"
import { isValidTableName } from "./isValidTableName"
import styled from "styled-components"
import { shortenText } from "../../../utils"

const List = styled.ul`
  list-style-position: inside;
  padding-left: 0;

  li {
    margin-bottom: 1rem;
  }
`

const StyledDescription = styled(Dialog.Description)`
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
    <Dialog.Root open={open}>
      <Dialog.Trigger asChild>
        <ForwardRef>
          <Button
            skin="transparent"
            prefixIcon={<Edit size="14px" />}
            onClick={() => onOpenChange(name)}
          >
            {shortenText(name, 20)}
          </Button>
        </ForwardRef>
      </Dialog.Trigger>

      <Dialog.Portal>
        <ForwardRef>
          <Overlay primitive={Dialog.Overlay} />
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
          <Dialog.Content
            onEscapeKeyDown={() => onOpenChange(undefined)}
            onInteractOutside={() => onOpenChange(undefined)}
          >
            <Dialog.Title>
              <Box>
                <Edit size={20} />
                Change table name erwer
              </Box>
            </Dialog.Title>

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
                  <li>
                    Cannot be named <strong>telemetry</strong> or{" "}
                    <strong>telemetry_config</strong>
                  </li>
                </List>
              </Text>
            </StyledDescription>

            <Dialog.ActionButtons>
              <Dialog.Close asChild>
                <Button
                  prefixIcon={<Undo size={18} />}
                  skin="secondary"
                  onClick={() => onOpenChange(undefined)}
                >
                  Dismiss
                </Button>
              </Dialog.Close>

              <Dialog.Close asChild>
                <ForwardRef>
                  <Form.Submit
                    prefixIcon={<Edit size={18} />}
                    variant="success"
                  >
                    Change
                  </Form.Submit>
                </ForwardRef>
              </Dialog.Close>
            </Dialog.ActionButtons>
          </Dialog.Content>
        </Form>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
