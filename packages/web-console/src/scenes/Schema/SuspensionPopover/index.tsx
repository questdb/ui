import React, { useState } from "react"
import { PopperToggle, Text } from "../../../components"
import { Form } from "../../../components/Form"
import { Box, Button } from "@questdb/react-components"
import styled from "styled-components"
import { ExternalLink, Restart } from "@styled-icons/remix-line"
import * as QuestDB from "../../../utils/questdb"

const Root = styled.div`
  display: flex;
  width: 100%;
  padding: 2rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px #723131 solid;
  border-radius: 4px;
  box-shadow: 0 0 25px 5px rgba(0, 0, 0, 0.2);
`

const ContentBlockBox = styled(Box).attrs({
  align: "flex-start",
  flexDirection: "column",
})`
  width: 100%;
`

const StyledTable = styled.table`
  width: 100%;
  text-align: center;
  border-spacing: 0.5rem;

  thead th {
    background: #32333f;
    font-weight: 600;
    padding: 0.5rem 0;
  }

  tbody td {
    background: #24252e;
    padding: 0.5rem 0;
  }
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

export const SuspensionPopover = ({
  walTableData,
}: {
  walTableData: QuestDB.WalTable
}) => {
  const [active, setActive] = useState(false)

  return (
    <PopperToggle
      placement="bottom-start"
      trigger={<span>Suspended</span>}
      active={active}
      onToggle={setActive}
    >
      <Root>
        <Box gap="1.5rem" flexDirection="column" align="flex-start">
          <Text color="red">Max open files limit reached in the OS</Text>
          <ContentBlockBox gap="0.5rem">
            <Text color="foreground">Workarounds and documentation:</Text>
            <Button skin="secondary" prefixIcon={<ExternalLink size="18px" />}>
              OS configuration
            </Button>
          </ContentBlockBox>
          <ContentBlockBox gap="0">
            <Text color="gray2">Transaction stats:</Text>
            <StyledTable>
              <thead>
                <th>TableWriter</th>
                <th>Sequencer</th>
              </thead>
              <tbody>
                <tr>
                  <td>{walTableData.writerTxn}</td>
                  <td>{walTableData.sequencerTxn}</td>
                </tr>
              </tbody>
            </StyledTable>
          </ContentBlockBox>
          <ContentBlockBox gap="0.5rem">
            <Text color="gray2">Start txn #:</Text>
            <Form name="resume_transaction_form" onSubmit={() => {}}>
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
                  prefixIcon={<Restart size="18px" />}
                  variant="secondary"
                >
                  Restart transaction
                </Form.Submit>
              </FormWrapper>
            </Form>
          </ContentBlockBox>
        </Box>
      </Root>
    </PopperToggle>
  )
}
