import React from "react"
import styled from "styled-components"
import { color } from "../../../utils"
import { Key } from "../../../components"
import { menuContainerStyles } from "../../../components/menuStyles"
import { ctrlCmd, altOption } from "../../../utils/platform"

type ShortcutsList = { keys: string[][]; title: string }[]

const Wrapper = styled.div`
  ${menuContainerStyles}
  width: 38rem;
  max-width: calc(100vw - 2.4rem);
  max-height: min(68rem, calc(100vh - 8rem));
  padding: 0.6rem;
  gap: 0;
  overflow-x: hidden;
  overflow-y: auto;
`

const List = styled.section`
  display: flex;
  flex-direction: column;
  width: 100%;

  & + & {
    margin-top: 0.6rem;
    padding-top: 0.6rem;
    border-top: 1px solid ${({ theme }) => theme.color.borderSubtle};
  }
`

const ListTitle = styled.h3`
  margin: 0;
  padding: 0.7rem 0.8rem 0.6rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.4;
  text-transform: uppercase;
`

const Item = styled.div`
  display: flex;
  align-items: center;
  min-height: 4rem;
  padding: 0.7rem 0.8rem;
  gap: 1.6rem;
  border-radius: 0.4rem;

  & + & {
    border-top: 1px solid ${({ theme }) => theme.color.borderSubtle};
  }
`

const ItemTitle = styled.span`
  min-width: 0;
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: 1.3rem;
  font-weight: 500;
  line-height: 1.4;
`

const ItemKeys = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-left: auto;
`

const KeyGroup = styled.div`
  display: inline-flex;
  align-items: center;
  color: ${color("contentSecondary")};

  & + &::before {
    content: "or";
    margin-right: 0.6rem;
    color: ${({ theme }) => theme.color.contentMuted};
    font-size: 1.1rem;
    line-height: 1;
  }
`

const editorList: ShortcutsList = [
  {
    keys: [["F9"], [ctrlCmd, "Enter"]],
    title: "Run query",
  },
  {
    keys: [[ctrlCmd, "⇧", "Enter"]],
    title: "Run all queries in a tab",
  },
  {
    keys: [[altOption, "T"]],
    title: "Add new tab",
  },
  {
    keys: [[altOption, ctrlCmd, "↑"]],
    title: "Add cursor above",
  },
  {
    keys: [[altOption, ctrlCmd, "↓"]],
    title: "Add cursor below",
  },
  {
    keys: [["⇧", altOption, "↑"]],
    title: "Copy line up",
  },
  {
    keys: [["⇧", altOption, "↓"]],
    title: "Copy line down",
  },
  {
    keys: [[altOption, "↑"]],
    title: "Move line up",
  },
  {
    keys: [[altOption, "↓"]],
    title: "Move line down",
  },
  {
    keys: [["⇧", altOption, "F"]],
    title: "Format document",
  },
  {
    keys: [["F1"]],
    title: "Command palette",
  },
]

const globalList: ShortcutsList = [
  {
    keys: [[ctrlCmd, "K"]],
    title: "Search docs",
  },
]

const ShortcutsGroup = ({
  list,
  title,
}: {
  list: ShortcutsList
  title: string
}) => (
  <List>
    <ListTitle>{title}</ListTitle>
    {list.map((shortcutItem) => (
      <Item key={`shortcut-${shortcutItem.title}`}>
        <ItemTitle>{shortcutItem.title}</ItemTitle>
        <ItemKeys>
          {shortcutItem.keys.map((keyGroup) => (
            <KeyGroup key={`${shortcutItem.title}-${keyGroup.join("-")}`}>
              {keyGroup.map((key) => (
                <Key
                  key={`${shortcutItem.title}-${keyGroup.join("-")}-${key}`}
                  keyString={key}
                  color={color("contentSecondary")}
                />
              ))}
            </KeyGroup>
          ))}
        </ItemKeys>
      </Item>
    ))}
  </List>
)

export const Shortcuts = () => (
  <Wrapper>
    <ShortcutsGroup list={globalList} title="Global shortcuts" />
    <ShortcutsGroup list={editorList} title="SQL editor shortcuts" />
  </Wrapper>
)
