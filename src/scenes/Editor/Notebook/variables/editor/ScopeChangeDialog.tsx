import React from "react"
import styled from "styled-components"
import {
  AlertDialog,
  Button,
  ForwardRef,
  Overlay,
  Text,
} from "../../../../../components"

const Header = styled.div`
  padding: 1.5rem 2rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.borderSubtle};
`

const Body = styled(AlertDialog.Description)`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
`

const AffectedList = styled.ul`
  margin: 0;
  padding-left: 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`

export type AffectedVariable = {
  name: string
  notebooks: string[]
}

type Props = {
  title: string
  message: string
  affected: AffectedVariable[]
  actions: React.ReactNode
  dataHook: string
  onCancel: () => void
}

export const ScopeChangeDialog: React.FC<Props> = ({
  title,
  message,
  affected,
  actions,
  dataHook,
  onCancel,
}) => (
  <AlertDialog.Root
    open
    onOpenChange={(open) => {
      if (!open) onCancel()
    }}
  >
    <AlertDialog.Portal>
      <ForwardRef>
        <Overlay primitive={AlertDialog.Overlay} />
      </ForwardRef>
      <AlertDialog.Content
        maxwidth="44rem"
        aria-describedby={undefined}
        data-hook={dataHook}
      >
        <Header>
          <AlertDialog.Title>{title}</AlertDialog.Title>
        </Header>
        <Body>
          <Text color="contentPrimary" size="sm">
            {message}
          </Text>
          <AffectedList>
            {affected.map((item) => (
              <li key={item.name}>
                <Text color="contentPrimary" size="sm">
                  @{item.name} in {item.notebooks.join(", ")}
                </Text>
              </li>
            ))}
          </AffectedList>
        </Body>
        <AlertDialog.ActionButtons>
          <AlertDialog.Cancel asChild>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </AlertDialog.Cancel>
          {actions}
        </AlertDialog.ActionButtons>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>
)
