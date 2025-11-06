import React, { useEffect, useState } from "react"
import { AlertDialog } from "../AlertDialog"
import { Box } from "../Box"
import { Button } from "../Button"
import { Card } from "../Card"
import { ForwardRef } from "../ForwardRef"
import { Loader } from "../Loader"
import { Overlay } from "../Overlay"
import { Input } from "../Input"
import { TextArea } from "../TextArea"
import { Text } from "../Text"
import Joi from "joi"
import { Chat, Envelope, X } from "@styled-icons/bootstrap"
import { Undo } from "@styled-icons/boxicons-regular"
import styled from "styled-components"

type Values = {
  email?: string
  message: string
}

const minLength = 20
const maxLength = 1000
const schema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .messages({
      "string.base": "Please enter an email address, it is required",
      "string.email": "Please enter a valid email address",
    }),
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

const FormControl = styled.div`
  display: grid;
  gap: 1rem;
  width: 100%;

  [data-lastpass-icon-root],
  span[data-np-uid] {
    display: none !important;
  }
`

const Label = styled.label<{ htmlFor: string }>`
  color: ${({ theme }) => theme.color.foreground};
`

const ChatIcon = styled(Chat)`
  color: ${({ theme }) => theme.color.foreground};
`

const StyledDialogContent = styled(AlertDialog.Content)`
  display: grid;
  gap: 1rem;
  background: #282a36;
`

const StyledCardContent = styled(Card.Content)<{ withAfterMessage: boolean }>`
  display: grid;
  gap: 2rem;
  width: 100%;
  ${({ withAfterMessage }) => !withAfterMessage && `padding-bottom: 0`}
`

const StyledTextArea = styled(TextArea)`
  min-height: 100px;
  max-height: 250px;
`

const Footer = ({
  message,
  isSubmitting,
  onConfirm,
}: {
  message: string
  isSubmitting: boolean
  onConfirm?: () => void
}) => {
  return (
    <AlertDialog.ActionButtons>
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
          <Button
            type="submit"
            disabled={isSubmitting || message.length === 0}
            skin="success"
            prefixIcon={
              isSubmitting ? <Loader size={18} /> : <Envelope size={18} />
            }
            dataHook="form-submit-button"
          >
            {isSubmitting ? "Sending..." : "Send"}
          </Button>
        </ForwardRef>
      </AlertDialog.Action>
    </AlertDialog.ActionButtons>
  )
}

type Props = {
  trigger?: ({
    setOpen,
  }: {
    setOpen: (open: boolean) => void
  }) => React.ReactNode
  onSubmit: (values: Values) => Promise<void>
  title?: string
  subtitle?: string
  initialMessage?: string
  afterMessage?: React.ReactNode
  withEmailInput?: boolean
  open?: boolean
  onOpenChange: (open: boolean) => void
}

type ErrorList = Record<string, string>

export const FeedbackDialog = ({
  withEmailInput,
  trigger,
  title,
  subtitle,
  initialMessage,
  afterMessage,
  onSubmit,
  open,
  onOpenChange,
}: Props) => {
  const [errors, setErrors] = useState<ErrorList>({})
  const [message, setMessage] = useState<string>(initialMessage ?? "")
  const [isOpen, setIsOpen] = useState(open)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validateFields = (
    schema: Joi.ObjectSchema,
    values: Record<string, string>,
    fieldNames: string[],
  ): ErrorList => {
    const newErrors: ErrorList = { ...errors }
    const res = schema.validate(values, { abortEarly: false })
    const errorsList: ErrorList = {}

    if (res.error) {
      res.error.details.forEach((error) => {
        const fieldName = error.path[0]
        errorsList[fieldName] = error.message
      })

      fieldNames.forEach((fieldName) => {
        const errorMessage = errorsList[fieldName] || ""
        newErrors[fieldName] = errorMessage
      })

      setErrors(newErrors)
      return newErrors
    } else {
      fieldNames.forEach((fieldName) => {
        delete newErrors[fieldName]
      })

      setErrors(newErrors)
      return newErrors
    }
  }

  useEffect(() => {
    setIsOpen(open)
  }, [open])

  return (
    <AlertDialog.Root open={isOpen} onOpenChange={onOpenChange}>
      {trigger && (
        <AlertDialog.Trigger asChild>
          <ForwardRef>{trigger({ setOpen: setIsOpen })}</ForwardRef>
        </AlertDialog.Trigger>
      )}

      <AlertDialog.Portal>
        <ForwardRef>
          <Overlay primitive={AlertDialog.Overlay} />
        </ForwardRef>

        <StyledDialogContent>
          <form
            name="feedback-dialog"
            onSubmit={async (e: React.FormEvent<HTMLFormElement>) => {
              e.preventDefault()
              const form = e.target as HTMLFormElement
              const message = form.message as HTMLTextAreaElement
              const email = form.email as HTMLInputElement
              const errors = validateFields(
                schema,
                { message: message.value, email: email.value },
                ["email", "message"],
              )
              if (Object.keys(errors).length === 0) {
                try {
                  setIsSubmitting(true)
                  await onSubmit({
                    email: withEmailInput ? email.value : undefined,
                    message: message.value,
                  })
                  setIsOpen(false)
                  onOpenChange(false)
                } finally {
                  setIsSubmitting(false)
                }
              }
            }}
          >
            <Card>
              <Card.Header
                title={
                  <Text color="foreground">{title ?? "Get In Touch"}</Text>
                }
                subtitle={
                  <Text color="foreground">
                    {subtitle ??
                      "Drop a message and we will come back to you soon"}
                  </Text>
                }
                beforeTitle={<ChatIcon size={24} />}
                afterTitle={
                  <Button
                    type="button"
                    skin="transparent"
                    onClick={() => {
                      setIsOpen(false)
                      onOpenChange(false)
                    }}
                  >
                    <X size={18} />
                  </Button>
                }
              />

              <StyledCardContent withAfterMessage={afterMessage !== undefined}>
                {withEmailInput && (
                  <FormControl>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      name="email"
                      type="email"
                      placeholder="email@address.com"
                      autoFocus
                      autoComplete="off"
                    />
                    <Text color="gray2">
                      Optional, if you want us to get back to you
                    </Text>
                    {errors && errors["email"] && (
                      <Text color="red">{errors.email}</Text>
                    )}
                  </FormControl>
                )}
                <FormControl>
                  <Label htmlFor="message">Message</Label>
                  <StyledTextArea
                    name="message"
                    rows={4}
                    placeholder="It would be great if I could..."
                    resize="vertical"
                    defaultValue={message}
                    onChange={(e) => {
                      setMessage(e.target.value)
                    }}
                  />
                  {errors && errors["message"] && (
                    <Text color="red">{errors.message}</Text>
                  )}
                </FormControl>
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

                {afterMessage}
              </StyledCardContent>

              <Footer
                isSubmitting={isSubmitting}
                message={message}
                onConfirm={() => {
                  setErrors({})
                  setMessage("")
                  setIsOpen(false)
                  onOpenChange(false)
                }}
              />
            </Card>
          </form>
        </StyledDialogContent>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
