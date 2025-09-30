import React from "react"
import { ProcessedParquet } from "./types"
import { Dialog, ForwardRef, Button, Overlay } from "@questdb/react-components"
import { Edit } from "@styled-icons/remix-line"
import { Undo } from "@styled-icons/boxicons-regular"
import { Text } from "../../../components/Text"
import { Form } from "../../../components/Form"
import { Box } from "../../../components/Box"
import Joi from "joi"
import styled from "styled-components"
import { shortenText } from "../../../utils"

const StyledDescription = styled(Dialog.Description)`
  display: grid;
  gap: 2rem;
`

type Props = {
  open: boolean
  onOpenChange: (file?: ProcessedParquet) => void
  onNameChange: (name: string) => void
  file: ProcessedParquet
}

const schema = Joi.object({
  name: Joi.string()
    .required()
    .messages({
      "string.empty": "Please enter a name",
    }),
})

export const RenameFileDialog = ({
  open,
  onOpenChange,
  onNameChange,
  file,
}: Props) => {
  const name = file.file_name
  return (
    <Dialog.Root open={open}>
      <Dialog.Trigger asChild>
        <ForwardRef>
          <Button
            data-hook="import-parquet-rename-file"
            skin="transparent"
            prefixIcon={<Edit size="14px" />}
            onClick={() => onOpenChange(file)}
          >
            {shortenText(name, 50)}
          </Button>
        </ForwardRef>
      </Dialog.Trigger>

      <Dialog.Portal>
        <ForwardRef>
          <Overlay primitive={Dialog.Overlay} />
        </ForwardRef>

        <Dialog.Content
          onEscapeKeyDown={() => onOpenChange(undefined)}
          onInteractOutside={() => onOpenChange(undefined)}
        >
          <Form<{ name: string }>
            name="rename-file"
            defaultValues={{ name }}
            onSubmit={(values) => {
              onNameChange(values.name)
              onOpenChange(undefined)
            }}
            validationSchema={schema}
          >
            <Dialog.Title>
              <Box>
                <Edit size={20} />
                Change import path
              </Box>
            </Dialog.Title>

            <StyledDescription>
              <Form.Item name="name" label="Import path">
                <Form.Input name="name" data-hook="import-parquet-rename-file-input" />
              </Form.Item>
              <Text color="gray2">
                This path is a relative path to the <code style={{ backgroundColor: "rgba(255, 255, 255, 0.1)", color: "#8be9fd" }}>sql.copy.input.root</code> directory.
                <br />
                <br />
                Example: <code style={{ backgroundColor: "rgba(255, 255, 255, 0.1)", color: "#8be9fd" }}>subdir/test.parquet</code>
                {' '}will import the data into <code style={{ backgroundColor: "rgba(255, 255, 255, 0.1)", color: "#8be9fd" }}>{"{"}sql.copy.input.root{"}"}/subdir/test.parquet</code>
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
                    data-hook="import-parquet-rename-file-submit"
                  >
                    Change
                  </Form.Submit>
                </ForwardRef>
              </Dialog.Close>
            </Dialog.ActionButtons>
          </Form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}