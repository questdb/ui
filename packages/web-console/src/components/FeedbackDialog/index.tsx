import React, { useState } from "react"
import {
  AlertDialog,
  Button,
  Card,
  ForwardRef,
  Loader,
  Overlay,
} from "@questdb/react-components"
import { Form } from "../../components/Form"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import Joi from "joi"
import { Email } from "styled-icons/material-outlined"
import { Undo } from "styled-icons/boxicons-regular"
import { Close } from "styled-icons/remix-line"
import { useFormContext } from "react-hook-form"
import styled from "styled-components"
import { Chat3 } from "styled-icons/remix-line"

type Values = {
  message: string
}

const minLength = 20
const maxLength = 1000
const schema = Joi.object({
  message: Joi.string()
    .min(minLength)
    .max(maxLength)
    .trim()
    .required()
    .messages({
      "string.min": `Please enter at least ${minLength} symbols`,
      "string.max": `Please enter a message shorter than ${maxLength} characters`,
      "string.trim": "Please enter a message",
      "string.empty": "Please enter a message",
    }),
})

const TextArea = styled(Form.TextArea)`
  min-width: 100%;
`

const Footer = ({ onConfirm }: { onConfirm?: () => void }) => {
  const formContext = useFormContext()
  const { isSubmitting } = formContext.formState
  const { message } = formContext.watch()

  return (
    <Card.Footer>
      <AlertDialog.Cancel asChild>
        <Button
          skin="transparent"
          prefixIcon={<Undo size={18} />}
          onClick={onConfirm}
        >
          Dismiss
        </Button>
      </AlertDialog.Cancel>

      <AlertDialog.Action asChild>
        <ForwardRef>
          <Form.Submit
            variant="success"
            prefixIcon={
              isSubmitting ? <Loader size={18} /> : <Email size={18} />
            }
            disabled={isSubmitting || message.length === 0}
          >
            {isSubmitting ? "Sending..." : "Send"}
          </Form.Submit>
        </ForwardRef>
      </AlertDialog.Action>
    </Card.Footer>
  )
}

type Props = {
  trigger: ({
    setOpen,
  }: {
    setOpen: (open: boolean) => void
  }) => React.ReactNode
  onSubmit: (values: Values) => void
  title?: string
  subtitle?: string
  initialMessage?: string
  afterMessage?: React.ReactNode
}

export const FeedbackDialog = ({
  trigger,
  title,
  subtitle,
  initialMessage,
  afterMessage,
  onSubmit,
}: Props) => {
  const [message, setMessage] = useState<string>(initialMessage ?? "")
  const [open, setOpen] = useState(false)

  return (
    <AlertDialog.Root open={open}>
      <AlertDialog.Trigger asChild>
        <ForwardRef>{trigger({ setOpen })}</ForwardRef>
      </AlertDialog.Trigger>

      <AlertDialog.Portal>
        <ForwardRef>
          <Overlay primitive={AlertDialog.Overlay} />
        </ForwardRef>

        <AlertDialog.Content>
          <Form<Values>
            name="feedback-dialog"
            onSubmit={onSubmit}
            onChange={({ message }) => {
              setMessage(message ?? "")
            }}
            defaultValues={{ message }}
            validationSchema={schema}
          >
            <Card>
              <Card.Header
                title={title ?? "Get In Touch"}
                subtitle={
                  subtitle ?? "Drop a message and we will come back to you soon"
                }
                beforeTitle={<Chat3 size={24} />}
                afterTitle={
                  <Button
                    type="button"
                    skin="transparent"
                    onClick={() => setOpen(false)}
                  >
                    <Close size={18} />
                  </Button>
                }
              />

              <Card.Content>
                <Form.Item name="message" label="Message">
                  <TextArea name="message" autoFocus />
                  <Box
                    justifyContent="flex-end"
                    style={{
                      color:
                        message.length < minLength || message.length > maxLength
                          ? "rgb(152, 79, 79)"
                          : "#33874b",
                    }}
                  >
                    {message.length}/{maxLength}
                  </Box>
                </Form.Item>

                {afterMessage}
              </Card.Content>

              <Footer onConfirm={() => setOpen(false)} />
            </Card>
          </Form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
