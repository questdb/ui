import React from "react"
import styled from "styled-components"
import { color } from "../../../utils"
import { Text } from "../../../components"
import { platform } from "../../../utils"

type ShortcutsList = { keys: string[][]; title: string }[]

const Wrapper = styled.div`
  display: flex;
  max-height: 650px;
  width: 300px;
  max-width: 100vw;
  flex-direction: column;
  background: ${color("draculaBackgroundDarker")};
  box-shadow: ${color("black")} 0px 5px 8px;
  border: 1px solid ${color("black")};
  border-radius: 4px;
  overflow: auto;
`
const List = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`

const ListTitle = styled(Text)`
  padding: 0.6rem 1.2rem;
  margin-top: 0.6rem;
  border-top: 1px solid ${({ theme }) => theme.color.draculaSelection};
  background: ${({ theme }) => theme.color.blackAlpha40};
  width: 100%;
`

const Item = styled.div`
  display: flex;
  align-items: center;
  padding: 0.6rem 1.2rem;

  &:not(:last-child) {
    border-bottom: 1px solid ${color("draculaBackground")};
  }
`

const ItemKeys = styled.div`
  margin-left: auto;
`

const KeyGroup = styled.span`
  color: ${color("gray2")};

  &:not(:last-child):after {
    content: "or";
    padding: 0 0.5rem;
  }
`

const Key = styled.span`
  padding: 0 4px;
  background: ${color("gray2")};
  border-radius: 2px;
  color: ${color("black")};

  &:not(:last-child) {
    margin-right: 0.25rem;
  }
`

const ctrlCmd = platform.isMacintosh || platform.isIOS ? "⌘" : "Ctrl"
const altOption = platform.isMacintosh || platform.isIOS ? "⌥" : "Alt"

const editorList: ShortcutsList = [
  {
    keys: [[altOption, ctrlCmd, "Up"]],
    title: "Add cursor above",
  },
  {
    keys: [[altOption, ctrlCmd, "Down"]],
    title: "Add cursor below",
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
    keys: [["F9"], [ctrlCmd, "Enter"]],
    title: "Run query",
  },
  {
    keys: [["F2"]],
    title: "Focus results grid",
  },
  {
    keys: [[ctrlCmd, "K"]],
    title: "Clear all notifications",
  },
]

export const ShortcutsList = ({
  list,
  title,
}: {
  list: ShortcutsList
  title: string
}) => (
  <List>
    <ListTitle>
      <Text color="gray2">{title}</Text>
    </ListTitle>
    {list.map((shortcutItem, index) => (
      <Item key={`shortcut-${index}`}>
        <Text color="white">{shortcutItem.title}</Text>
        <ItemKeys>
          {shortcutItem.keys.map((keyGroup, index) => (
            <KeyGroup key={`keyGroup-${index}`}>
              {keyGroup.map((key, index) => (
                <Key key={`shortcutItem-key-${key}-${index}`}>
                  <Text color="black" size="xs" weight={600}>
                    {key}
                  </Text>
                </Key>
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
    <ShortcutsList list={globalList} title="Global shortcuts" />
    <ShortcutsList list={editorList} title="SQL editor shortcuts" />
  </Wrapper>
)
