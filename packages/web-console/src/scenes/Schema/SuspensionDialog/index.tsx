import React from "react"
import { Dialog, ForwardRef, Button, Overlay } from "@questdb/react-components"
import { Error as ErrorIcon, Undo } from "@styled-icons/boxicons-regular"
import styled from "styled-components"
import * as QuestDB from "../../../utils/questdb"
import { Edit, ExternalLink, Restart } from "@styled-icons/remix-line"
import { Box } from "../../../components/Box"
import { Form } from "../../../components/Form"
import { useState, useContext, useEffect } from "react"
import { QuestContext } from "../../../providers"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"
import { ErrorResult } from "../../../utils"
import { Text, Link } from "../../../components"
import Joi from "joi"

const ErrorButton = styled(Button)`
  background: #3e1b1b;
  border: 1px #723131 solid;
  color: #f47474;
  padding: 3px 10px;
  font-size: 1.3rem;
`

const StyledDescription = styled(Dialog.Description)`
  display: grid;
  gap: 2rem;
`

const ContentBlockBox = styled(Box).attrs({
  align: "center",
  flexDirection: "column",
})`
  width: 100%;
`

const FormWrapper = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: 100px auto;
  gap: 1rem;
`

const TransactionInput = styled(Form.Input)`
  width: 10rem;
`

type FormValues = {
  resume_transaction_id?: number
}

const GENERIC_ERROR_TEXT = "Error restarting transaction"

const walErrorWorkarounds: Record<
  QuestDB.WalErrorTag,
  {
    title: string
    link: string
  }
> = {
  [QuestDB.WalErrorTag.TOO_MANY_OPEN_FILES]: {
    title: "System limit for open files",
    link: "https://questdb.io/docs/deployment/capacity-planning/#maximum-open-files",
  },
  [QuestDB.WalErrorTag.DISK_FULL]: {
    title: "OS configuration",
    link: "https://questdb.io/docs/deployment/capacity-planning/#os-configuration",
  },
  [QuestDB.WalErrorTag.OUT_OF_MMAP_AREAS]: {
    title: "Max virtual memory areas limit",
    link: "https://questdb.io/docs/deployment/capacity-planning/#max-virtual-memory-areas-limit",
  },
  [QuestDB.WalErrorTag.OUT_OF_MEMORY]: {
    title: "Out of memory",
    link: "https://questdb.io/docs/deployment/capacity-planning/#cpu-and-ram-configuration",
  },
  [QuestDB.WalErrorTag.NONE]: {
    title: "OS configuration",
    link: "https://questdb.io/docs/deployment/capacity-planning/#os-configuration",
  },
}

export const SuspensionDialog = ({
  walTableData,
}: {
  walTableData: QuestDB.WalTable
}) => {
  const [active, setActive] = useState(false)
  const { quest } = useContext(QuestContext)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const handleSubmit = async (values: FormValues) => {
    setIsSubmitting(true)
    setError(undefined)
    try {
      const response = await quest.query(
        `ALTER TABLE ${walTableData.name} RESUME WAL${
          values.resume_transaction_id
            ? ` FROM TRANSACTION ${values.resume_transaction_id}`
            : ""
        }`,
      )
      if (response && response.type === QuestDB.Type.DDL) {
        eventBus.publish(EventType.MSG_QUERY_SCHEMA)
        setIsSubmitted(true)
      } else {
        setError(GENERIC_ERROR_TEXT)
      }
      setIsSubmitting(false)
    } catch (e) {
      const error = e as ErrorResult
      setIsSubmitting(false)
      setError(`${GENERIC_ERROR_TEXT}${error.error ? `: ${error.error}` : ""}`)
    }
  }

  useEffect(() => {
    if (active) {
      setError(undefined)
      setIsSubmitted(false)
    }
  }, [active])

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <ForwardRef>
          <ErrorButton prefixIcon={<ErrorIcon size="18px" />}>
            Suspended
          </ErrorButton>
        </ForwardRef>
      </Dialog.Trigger>

      <Dialog.Portal>
        <ForwardRef>
          <Overlay primitive={Dialog.Overlay} />
        </ForwardRef>

        <Dialog.Content>
          <Dialog.Title>
            <Box>
              <Edit size={20} />
              {walTableData.name} is suspended
            </Box>
          </Dialog.Title>

          <StyledDescription>
            <Box gap="1.5rem" flexDirection="column" align="center">
              {error && <Text color="red">{error}</Text>}
              {isSubmitted && (
                <Text color="green">Transaction restarted successfully</Text>
              )}
              {walTableData.errorTag && walTableData.errorMessage && (
                <>
                  <Text
                    color="red"
                    data-hook="schema-suspension-popover-error-message"
                    size="lg"
                  >
                    {walTableData.errorTag}: {walTableData.errorMessage}
                  </Text>
                  {walErrorWorkarounds[walTableData.errorTag] && (
                    <ContentBlockBox gap="0.5rem">
                      <Text color="foreground">
                        Workarounds and documentation:
                      </Text>
                      <Link
                        color="cyan"
                        hoverColor="cyan"
                        href={walErrorWorkarounds[walTableData.errorTag].link}
                        rel="noreferrer"
                        target="_blank"
                        data-hook="schema-suspension-popover-error-link"
                      >
                        <Box align="center" gap="0.25rem">
                          <ExternalLink size="16px" />
                          {walErrorWorkarounds[walTableData.errorTag].title}
                        </Box>
                      </Link>
                    </ContentBlockBox>
                  )}
                </>
              )}
              <ContentBlockBox gap="0.5rem">
                <Text color="gray2">Start at (optional):</Text>
                <Form<FormValues>
                  name="resume_transaction_form"
                  onSubmit={handleSubmit}
                  defaultValues={{ resume_transaction_id: undefined }}
                  validationSchema={Joi.object({
                    resume_transaction_id: Joi.number().optional().allow(""),
                  })}
                >
                  <FormWrapper>
                    <Form.Item name="resume_transaction_id">
                      <TransactionInput
                        name="resume_transaction_id"
                        placeholder={(
                          parseInt(walTableData.writerTxn) + 1
                        ).toString()}
                      />
                    </Form.Item>
                    <Form.Submit
                      disabled={isSubmitting}
                      prefixIcon={<Restart size="18px" />}
                      variant="secondary"
                      data-hook="schema-suspension-popover-restart-transaction"
                    >
                      {isSubmitting ? "Restarting..." : "Resume WAL"}
                    </Form.Submit>
                  </FormWrapper>
                </Form>
              </ContentBlockBox>
            </Box>
          </StyledDescription>

          <Dialog.ActionButtons>
            <Dialog.Close asChild>
              <Button prefixIcon={<Undo size={18} />} skin="secondary">
                Dismiss
              </Button>
            </Dialog.Close>
          </Dialog.ActionButtons>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
