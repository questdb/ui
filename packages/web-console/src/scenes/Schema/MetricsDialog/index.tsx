import React from "react"
import {
  Dialog,
  ForwardRef,
  Button,
  Overlay,
  Input,
} from "@questdb/react-components"
import { Error as ErrorIcon, Undo } from "@styled-icons/boxicons-regular"
import styled from "styled-components"
import * as QuestDB from "../../../utils/questdb"
import {
  FileCopy,
  ExternalLink,
  HealthBook,
  Restart,
  Table,
} from "@styled-icons/remix-line"
import { Chart } from "@styled-icons/boxicons-regular"
import { Box } from "../../../components/Box"
import { Form } from "../../../components/Form"
import { useState, useContext, useEffect } from "react"
import { QuestContext } from "../../../providers"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"
import { ErrorResult } from "../../../utils"
import { Text, Link } from "../../../components"
import { errorWorkarounds } from "../../../utils/errorWorkarounds"
import Joi from "joi"
import { WarningButton } from "../warning-button"

const StyledDialogContent = styled(Dialog.Content)`
  border-color: #654a2c;
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

type FormValues = {
  resume_transaction_id?: number
}

const GENERIC_ERROR_TEXT = "Error restarting transaction"

export const MetricsDialog = ({
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
    <Dialog.Root
      open={active}
      onOpenChange={(open) => {
        if (!open) {
          eventBus.publish(EventType.MSG_QUERY_SCHEMA)
        }
      }}
    >
      <Dialog.Trigger asChild>
        <ForwardRef>
          <WarningButton
            prefixIcon={<Chart size="16px" />}
            data-hook="metrics-dialog-trigger"
            onClick={(e: any) => {
              setActive(true)
              e.stopPropagation()
            }}
          >
            Metrics
          </WarningButton>
        </ForwardRef>
      </Dialog.Trigger>

      <Dialog.Portal>
        <ForwardRef>
          <Overlay primitive={Dialog.Overlay} />
        </ForwardRef>

        <StyledDialogContent
          data-hook="metrics-dialog"
          data-table-name={walTableData.name}
          onClick={(e: React.MouseEvent<HTMLDivElement>) => {
            e.stopPropagation()
          }}
          onEscapeKeyDown={() => setActive(false)}
          onPointerDownOutside={() => setActive(false)}
        >
          <Dialog.Title>
            <Box>
              <Table size={20} color="#ffb86c" />
              WAL metrics for {walTableData.name}
            </Box>
          </Dialog.Title>

          <StyledDescription>graph and details here</StyledDescription>

          <Dialog.ActionButtons>
            <Dialog.Close asChild>
              <Button
                prefixIcon={<Undo size={18} />}
                skin="secondary"
                data-hook="metrics-dialog-dismiss"
                onClick={() => setActive(false)}
              >
                Dismiss
              </Button>
            </Dialog.Close>
          </Dialog.ActionButtons>
        </StyledDialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
