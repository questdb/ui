import React, { useEffect, useState } from "react"
import { AlertDialog } from "../AlertDialog"
import { Box } from "../Box"
import { Button } from "../Button"
import { IconButton } from "../IconButton"
import { Card } from "../Card"
import { ForwardRef } from "../ForwardRef"
import { Loader } from "../Loader"
import { Overlay } from "../Overlay"
import { Input } from "../Input"
import { TextArea } from "../TextArea"
import { Text } from "../Text"
import Joi from "joi"
import { Chat, Envelope, X } from "../icons"
import { Undo } from "../icons"
import styled, { useTheme } from "styled-components"

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
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`

const ChatIcon = styled(Chat)`
  color: ${({ theme }) => theme.color.contentAccent};
  box-sizing: content-box;
  padding: 0.8rem;
  border-radius: 0.8rem;
  background: ${({ theme }) => theme.color.interactionAccentActive};
`

const StyledDialogContent = styled(AlertDialog.Content)`
  display: grid;
  gap: 0;
  padding: 0;
  max-width: 56rem;
  overflow: hidden;

  form > div {
    background: transparent;
    border: 0;
    border-radius: 0;
  }
`

const StyledCardContent = styled(Card.Content)<{ withAfterMessage: boolean }>`
  display: grid;
  gap: 1.8rem;
  width: 100%;
  padding: 2.2rem 2.4rem;
  ${({ withAfterMessage }) => !withAfterMessage && `padding-bottom: 0`}
`

const StyledCardHeader = styled(Card.Header)`
  background: ${({ theme }) => theme.color.editorCanvas};
  border-bottom: 1px solid ${({ theme }) => theme.color.borderSubtle};
  border-radius: 0;

  > div {
    min-height: 6.8rem;
    padding: 1.2rem 2.4rem;
  }
`

const DialogActions = styled(AlertDialog.ActionButtons)`
  margin: 0;
  padding: 1.4rem 2.4rem;
  border-top: 1px solid ${({ theme }) => theme.color.borderSubtle};
  background: ${({ theme }) => theme.color.editorCanvas};

  button {
    min-height: 3.4rem;
    padding-inline: 1.4rem;
    font-size: 1.3rem;
  }
`

const StyledTextArea = styled(TextArea)`
  min-height: 140px;
  max-height: 250px;
  line-height: 1.5;
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
    <DialogActions>
      <AlertDialog.Cancel asChild>
        <Button
          variant="ghost"
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
            variant="primary"
            prefixIcon={
              isSubmitting ? <Loader size={18} /> : <Envelope size={18} />
            }
            dataHook="form-submit-button"
          >
            {isSubmitting ? "Sending..." : "Send"}
          </Button>
        </ForwardRef>
      </AlertDialog.Action>
    </DialogActions>
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
  const theme = useTheme()
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
              const email = form.email as HTMLInputElement | undefined
              const errors = validateFields(
                schema,
                { message: message.value, email: email?.value ?? "" },
                withEmailInput ? ["email", "message"] : ["message"],
              )
              if (Object.keys(errors).length === 0) {
                try {
                  setIsSubmitting(true)
                  await onSubmit({
                    email: withEmailInput ? email?.value : undefined,
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
              <StyledCardHeader
                title={
                  <AlertDialog.Title color="contentPrimary">
                    {title ?? "Contact QuestDB"}
                  </AlertDialog.Title>
                }
                subtitle={
                  <Text color="contentPrimary">
                    {subtitle ??
                      "Tell us what you are working on. Our team will get back to you shortly."}
                  </Text>
                }
                beforeTitle={<ChatIcon size={24} />}
                afterTitle={
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    label="Close contact dialog"
                    onClick={() => {
                      setIsOpen(false)
                      onOpenChange(false)
                    }}
                  >
                    <X size={18} />
                  </IconButton>
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
                    <Text color="contentSecondary">
                      Optional, if you want us to get back to you
                    </Text>
                    {errors && errors["email"] && (
                      <Text color="statusDanger">{errors.email}</Text>
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
                    <Text color="statusDanger">{errors.message}</Text>
                  )}
                </FormControl>
                <Box
                  justifyContent="flex-end"
                  style={{
                    color:
                      message.length < minLength || message.length > maxLength
                        ? theme.color.statusDanger
                        : theme.color.statusSuccessStrong,
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
