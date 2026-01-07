import React from "react"
import {
  Box,
  Text,
  Link,
  Form,
  Dialog,
  ForwardRef,
  Button,
  Overlay,
  Input,
  CopyButton,
} from "../../../components"
import { Undo, CheckCircle } from "@styled-icons/boxicons-regular"
import styled from "styled-components"
import * as QuestDB from "../../../utils/questdb"
import { ExternalLink, Restart, Table } from "@styled-icons/remix-line"
import { useState, useContext, useEffect, useCallback } from "react"
import { QuestContext } from "../../../providers"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"
import { ErrorResult } from "../../../utils"
import { errorWorkarounds } from "../../../utils/errorWorkarounds"
import { CircleNotchSpinner } from "../../Editor/Monaco/icons"
import Joi from "joi"

const StyledDialogContent = styled(Dialog.Content)<{ $success?: boolean }>`
  border-color: ${({ $success, theme }) =>
    $success ? theme.color.green : theme.color.red};
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

const StyledInput = styled(Input)`
  width: 100%;
  font-family: ${({ theme }) => theme.fontMonospace};
  background: #313340;
  border-color: ${({ theme }) => theme.color.selection};
`

const StyledTable = styled(Table)<{ $success?: boolean }>`
  color: ${({ $success, theme }) =>
    $success ? theme.color.green : theme.color.red};
`

const LoadingContainer = styled(Box).attrs({
  flexDirection: "column",
  gap: "1rem",
  align: "center",
  justifyContent: "center",
})`
  padding: 4rem;
`

type FormValues = {
  resume_transaction_id?: number
}

const GENERIC_ERROR_TEXT = "Error restarting transaction"

type Props = {
  tableName: string
  open: boolean
  kind: "table" | "matview"
  onOpenChange: (open: boolean) => void
}

export const SuspensionDialog = ({
  tableName,
  open,
  onOpenChange,
  kind,
}: Props) => {
  const { quest } = useContext(QuestContext)
  const [walTableData, setWalTableData] = useState<QuestDB.WalTable | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const fetchWalTableData = useCallback(async () => {
    try {
      const escapedName = tableName.replace(/'/g, "''")
      const response = await quest.query<QuestDB.WalTable>(
        `wal_tables() WHERE name = '${escapedName}'`,
      )
      if (response.type === QuestDB.Type.DQL && response.data.length > 0) {
        setWalTableData(response.data[0])
      }
    } catch (error) {
      console.error("Failed to fetch WAL table data:", error)
    }
  }, [quest, tableName])

  useEffect(() => {
    if (!open) return

    setLoading(true)
    void fetchWalTableData().finally(() => setLoading(false))

    const interval = setInterval(() => {
      void fetchWalTableData()
    }, 1000)

    return () => clearInterval(interval)
  }, [open, fetchWalTableData])

  const txnLag = walTableData
    ? parseFloat(walTableData.sequencerTxn) - parseFloat(walTableData.writerTxn)
    : 0

  const handleSubmit = async (values: FormValues) => {
    setIsSubmitting(true)
    setError(undefined)
    const escapedName = tableName.replace(/'/g, "''")
    const queryStart = `ALTER ${kind === "matview" ? "MATERIALIZED VIEW" : "TABLE"}`
    try {
      const response = await quest.query(
        `${queryStart} '${escapedName}' RESUME WAL${
          values.resume_transaction_id
            ? ` FROM TRANSACTION ${values.resume_transaction_id}`
            : ""
        }`,
      )
      if (response && response.type === QuestDB.Type.DDL) {
        setIsSubmitted(true)
      } else {
        setError(GENERIC_ERROR_TEXT)
      }
      setIsSubmitting(false)
    } catch (e) {
      const error = e as ErrorResult
      setIsSubmitting(false)
      setError(`${GENERIC_ERROR_TEXT}${error.error ? `: ${error.error}` : ""}`)
    } finally {
      await fetchWalTableData()
    }
  }

  useEffect(() => {
    if (open) {
      setError(undefined)
      setIsSubmitted(false)
      setWalTableData(null)
    }
  }, [open])

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) {
          eventBus.publish(EventType.MSG_QUERY_SCHEMA)
        }
        onOpenChange(newOpen)
      }}
    >
      <Dialog.Portal>
        <ForwardRef>
          <Overlay primitive={Dialog.Overlay} />
        </ForwardRef>

        <StyledDialogContent
          data-hook="schema-suspension-dialog"
          data-table-name={tableName}
          onClick={(e: React.MouseEvent<HTMLDivElement>) => {
            e.stopPropagation()
          }}
          onEscapeKeyDown={() => onOpenChange(false)}
          onPointerDownOutside={() => onOpenChange(false)}
          $success={isSubmitted}
        >
          <Dialog.Title>
            <Box>
              <StyledTable size={20} $success={isSubmitted} />
              {kind === "table" ? "Table" : "Materialized view"} is suspended:{" "}
              {tableName}
            </Box>
          </Dialog.Title>

          <StyledDescription>
            {loading ? (
              <LoadingContainer>
                <CircleNotchSpinner size={24} />
                <Text color="gray2">Loading WAL status...</Text>
              </LoadingContainer>
            ) : walTableData ? (
              <Box gap="3rem" flexDirection="column" align="center">
                {error && <Text color="red">{error}</Text>}

                {isSubmitted && (
                  <Text color="green" size="lg">
                    WAL resumed successfully!
                  </Text>
                )}

                {walTableData.errorTag &&
                  !isSubmitted &&
                  errorWorkarounds[walTableData.errorTag] && (
                    <Text
                      color="red"
                      data-hook="schema-suspension-dialog-error-message"
                      size="lg"
                      align="center"
                    >
                      {errorWorkarounds[walTableData.errorTag].message}
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
                  {txnLag} transaction
                  {txnLag === 1 ? "" : "s"} behind
                </Text>

                {walTableData.errorMessage && (
                  <Box
                    flexDirection="column"
                    gap="1rem"
                    style={{ width: "100%" }}
                  >
                    <Text color="foreground">Server message:</Text>
                    <Box gap="0.5rem" style={{ width: "100%" }}>
                      <StyledInput
                        name="server_message"
                        disabled
                        value={walTableData.errorMessage}
                      />
                      <CopyButton
                        iconOnly
                        text={walTableData.errorMessage ?? ""}
                      />
                    </Box>
                  </Box>
                )}

                {walTableData.errorTag &&
                  errorWorkarounds[walTableData.errorTag] && (
                    <ContentBlockBox gap="0.5rem">
                      <Text color="foreground">
                        Workarounds and documentation:
                      </Text>
                      <Link
                        color="cyan"
                        hoverColor="cyan"
                        href={errorWorkarounds[walTableData.errorTag].link}
                        rel="noreferrer"
                        target="_blank"
                        data-hook="schema-suspension-dialog-error-link"
                      >
                        <Box align="center" gap="0.25rem">
                          <ExternalLink size="16px" />
                          {errorWorkarounds[walTableData.errorTag].title}
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
            ) : (
              <LoadingContainer>
                <Text color="red">Failed to load WAL data</Text>
              </LoadingContainer>
            )}
          </StyledDescription>

          <Dialog.ActionButtons>
            <Dialog.Close asChild>
              <Button
                prefixIcon={
                  isSubmitted ? <CheckCircle size={18} /> : <Undo size={18} />
                }
                skin={isSubmitted ? "success" : "secondary"}
                data-hook="schema-suspension-dialog-dismiss"
                onClick={() => onOpenChange(false)}
              >
                {isSubmitted ? "Close" : "Dismiss"}
              </Button>
            </Dialog.Close>
          </Dialog.ActionButtons>
        </StyledDialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
