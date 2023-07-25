import React, { useState } from "react";
import { AlertDialog } from "../AlertDialog";
import { Box } from "../Box";
import { Button } from "../Button";
import { Card } from "../Card";
import { ForwardRef } from "../ForwardRef";
import { Loader } from "../Loader";
import { Overlay } from "../Overlay";
import { TextArea } from "../TextArea";
import { Text } from "../Text";
import Joi from "joi";
import { Chat, Envelope, X } from "@styled-icons/bootstrap";
import { Undo } from "../icons/undo";
import styled from "styled-components";

type Values = {
  message: string;
};

const minLength = 20;
const maxLength = 1000;
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
});

const ChatIcon = styled(Chat)`
  color: ${({ theme }) => theme.color.foreground};
`;

const StyledDialogContent = styled(AlertDialog.Content)`
  background: #282a36;
`;

const StyledCardContent = styled(Card.Content)<{ withAfterMessage: boolean }>`
  ${({ withAfterMessage }) => !withAfterMessage && `padding-bottom: 0`}
`;

const Footer = ({
  message,
  isSubmitting,
  onConfirm,
}: {
  message: string;
  isSubmitting: boolean;
  onConfirm?: () => void;
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
  );
};

type Props = {
  trigger: ({
    setOpen,
  }: {
    setOpen: (open: boolean) => void;
  }) => React.ReactNode;
  onSubmit: (values: Values) => void;
  title?: string;
  subtitle?: string;
  initialMessage?: string;
  afterMessage?: React.ReactNode;
  isSubmitting: boolean;
};

type ErrorList = Record<string, string>;

export const FeedbackDialog = ({
  isSubmitting,
  trigger,
  title,
  subtitle,
  initialMessage,
  afterMessage,
  onSubmit,
}: Props) => {
  const [errors, setErrors] = useState<ErrorList>({});
  const [message, setMessage] = useState<string>(initialMessage ?? "");
  const [open, setOpen] = useState(false);

  const validateField = (
    schema: Joi.ObjectSchema,
    values: Record<string, string>,
    fieldName: string
  ): ErrorList => {
    const err: ErrorList = { ...errors };
    const res = schema.validate(values);
    let errorsList: ErrorList = {};
    if (res.error) {
      res.error.details.forEach((error) => {
        errorsList[fieldName] = error.message;
      });
      const newErrors = {
        ...errors,
        ...errorsList,
      };
      setErrors(newErrors);
      return newErrors;
    } else {
      delete err[fieldName];
      setErrors(err);
      return err;
    }
  };

  return (
    <AlertDialog.Root open={open}>
      <AlertDialog.Trigger asChild>
        <ForwardRef>{trigger({ setOpen })}</ForwardRef>
      </AlertDialog.Trigger>

      <AlertDialog.Portal>
        <ForwardRef>
          <Overlay primitive={AlertDialog.Overlay} />
        </ForwardRef>

        <StyledDialogContent>
          <form
            name="feedback-dialog"
            onSubmit={(e: React.BaseSyntheticEvent) => {
              e.preventDefault();
              const errors = validateField(
                schema,
                { message: e.target.message.value },
                "message"
              );
              if (Object.keys(errors).length === 0) {
                onSubmit({
                  message: e.target.message.value,
                });
              }
            }}
            onChange={(e: React.BaseSyntheticEvent) => {
              setMessage(e.target.value);
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
                    onClick={() => setOpen(false)}
                  >
                    <X size={18} />
                  </Button>
                }
              />

              <StyledCardContent withAfterMessage={afterMessage !== undefined}>
                <TextArea name="message" rows={4} autoFocus />
                {errors && errors["message"] && (
                  <Text color="red">{errors.message}</Text>
                )}
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
                  setErrors({});
                  setMessage("");
                  setOpen(false);
                }}
              />
            </Card>
          </form>
        </StyledDialogContent>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
};
