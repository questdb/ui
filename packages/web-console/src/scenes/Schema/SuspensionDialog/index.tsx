import React from "react"
import { Dialog, ForwardRef, Button, Overlay } from "@questdb/react-components"
import { Error as ErrorIcon, Undo } from "@styled-icons/boxicons-regular"
import styled from "styled-components"
import * as QuestDB from "../../../utils/questdb"
import { ExternalLink, Restart, Table } from "@styled-icons/remix-line"
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

const StyledDialogContent = styled(Dialog.Content)`
  border-color: #723131;
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

const Icon = styled(Box)`
  height: 4.8rem;
`

type FormValues = {
  resume_transaction_id?: number
}

const GENERIC_ERROR_TEXT = "Error restarting transaction"

const walErrorWorkarounds: Record<
  QuestDB.WalErrorTag,
  {
    title: string
    message: string
    link: string
  }
> = {
  [QuestDB.WalErrorTag.TOO_MANY_OPEN_FILES]: {
    title: "System limit for open files",
    message:
      "Too many open files, please, increase the maximum number of open file handlers OS limit",
    link: "https://questdb.io/docs/deployment/capacity-planning/#maximum-open-files",
  },
  [QuestDB.WalErrorTag.DISK_FULL]: {
    title: "OS configuration",
    message:
      "No space left on device, please, extend the volume or free existing disk space up",
    link: "https://questdb.io/docs/deployment/capacity-planning/#os-configuration",
  },
  [QuestDB.WalErrorTag.OUT_OF_MMAP_AREAS]: {
    title: "Max virtual memory areas limit",
    message:
      "Out of virtual memory mapping areas, please, increase the maximum number of memory-mapped areas OS limit",
    link: "https://questdb.io/docs/deployment/capacity-planning/#max-virtual-memory-areas-limit",
  },
  [QuestDB.WalErrorTag.OUT_OF_MEMORY]: {
    title: "Out of memory",
    message:
      "Out of memory, please, analyze system metrics, and upgrade memory, if necessary",
    link: "https://questdb.io/docs/deployment/capacity-planning/#cpu-and-ram-configuration",
  },
  [QuestDB.WalErrorTag.UNSUPPORTED_FILE_SYSTEM]: {
    title: "Unsupported file system",
    message:
      "DB root is located on an unsupported file system, please, move the DB root to a volume with supported file system",
    link: "https://questdb.io/docs/operations/backup/#supported-filesystems",
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
          <ErrorButton
            prefixIcon={<ErrorIcon size="18px" />}
            data-hook="schema-suspension-dialog-trigger"
          >
            Suspended
          </ErrorButton>
        </ForwardRef>
      </Dialog.Trigger>

      <Dialog.Portal>
        <ForwardRef>
          <Overlay primitive={Dialog.Overlay} />
        </ForwardRef>

        <StyledDialogContent
          data-hook="schema-suspension-dialog"
          data-table-name={walTableData.name}
        >
          <Dialog.Title>
            <Box>
              <Table size={20} color="#FF5555" />
              <span>{walTableData.name}</span> is suspended
            </Box>
          </Dialog.Title>

          <StyledDescription>
            <Box gap="3rem" flexDirection="column" align="center">
              {error && <Text color="red">{error}</Text>}

              {isSubmitted && (
                <Text color="green">Transaction restarted successfully</Text>
              )}

              {walTableData.errorTag &&
                walErrorWorkarounds[walTableData.errorTag] && (
                  <Text
                    color="red"
                    data-hook="schema-suspension-dialog-error-message"
                    size="lg"
                    align="center"
                  >
                    {walErrorWorkarounds[walTableData.errorTag].message}
                  </Text>
                )}

              <Box gap="2rem" align="flex-start">
                <Box gap="1rem" flexDirection="column" align="center">
                  <Icon>
                    <img
                      src="assets/icon-copy.svg"
                      alt="Copy icon"
                      width="48"
                      height="48"
                    />
                  </Icon>
                  <Text color="foreground" size="lg">
                    {walTableData.sequencerTxn}
                  </Text>
                </Box>
                <Icon>
                  <img
                    src="assets/line.svg"
                    alt="Broken transation illustration"
                    width="108"
                    height="18"
                  />
                </Icon>
                <Box gap="1rem" flexDirection="column" align="center">
                  <Icon>
                    <img
                      src="assets/icon-database.svg"
                      alt="Database icon"
                      width="36"
                      height="38"
                    />
                  </Icon>
                  <Text color="foreground" size="lg">
                    {walTableData.writerTxn}
                  </Text>
                </Box>
              </Box>

              <Text color="foreground" size="lg">
                {walTableData.writerLagTxnCount} transaction
                {walTableData.writerLagTxnCount === "1" ? "" : "s"} behind
              </Text>

              {walTableData.errorTag &&
                walErrorWorkarounds[walTableData.errorTag] && (
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
                      data-hook="schema-suspension-dialog-error-link"
                    >
                      <Box align="center" gap="0.25rem">
                        <ExternalLink size="16px" />
                        {walErrorWorkarounds[walTableData.errorTag].title}
                      </Box>
                    </Link>
                  </ContentBlockBox>
                )}

              <ContentBlockBox gap="2rem">
                <Text color="gray2">
                  If you have addressed the issue, restart the process:
                </Text>
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
                      data-hook="schema-suspension-dialog-restart-transaction"
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
        </StyledDialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
