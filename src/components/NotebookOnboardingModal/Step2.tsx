import React from "react"
import styled from "styled-components"
import {
  AirTrafficControlIcon,
  ArrowsLeftRightIcon,
  CursorClickIcon,
  LockKeyIcon,
} from "@phosphor-icons/react"
import { Button } from "../Button"
import { McpSetupCommand } from "../McpSetupCommand"
import { color } from "../../utils"
import {
  Badge,
  BottomGroup,
  Bullet,
  BulletList,
  LeftPane,
  PRIMARY_BUTTON_HOOK,
  Separator,
  Subtitle,
  Title,
  TitleRow,
} from "./shared"

const CommandGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
`

const Instruction = styled.p`
  margin: 0;
  font-size: 1.4rem;
  line-height: 1.4;
  color: ${color("foreground")};
`

const CommandBox = styled.div`
  display: flex;
  align-items: center;
  gap: 1.2rem;
  width: 100%;
  padding: 0.7rem 0.7rem 0.7rem 1.7rem;
  background: #111111;
  border: 1px solid rgba(252, 252, 252, 0.2);
  border-radius: 0.5rem;
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05);
`

const CreateButton = styled(Button)`
  width: 100%;
  height: auto;
  min-height: 3.2rem;
  padding: 0.7rem 1.4rem;
  border-radius: 0.4rem;
  font-size: 1.4rem;
  font-weight: 500;
`

export const Step2 = ({
  onCreateNotebook,
}: {
  onCreateNotebook: () => void
}) => (
  <LeftPane $center>
    <div>
      <TitleRow>
        <Title>QuestDB MCP Connection</Title>
        <Badge>New</Badge>
      </TitleRow>
      <Subtitle>AI agents copilot notebooks to streamline workflows.</Subtitle>
    </div>

    <BulletList>
      <Bullet icon={<ArrowsLeftRightIcon size={20} />} title="Two-way handoff">
        Build and rearrange cells and notes, tweak and run queries. Hand
        analysis back and forth with your agent.
      </Bullet>
      <Bullet icon={<LockKeyIcon size={20} />} title="Privacy first">
        The MCP bridge runs locally on your machine, your data is never sent to
        a remote server.
      </Bullet>
      <Bullet icon={<AirTrafficControlIcon size={20} />} title="Full control">
        Agents can access only what you permit: granular control of schema
        access, read, and write permissions.
      </Bullet>
    </BulletList>

    <BottomGroup>
      <CommandGroup>
        <Instruction>
          Install the MCP using your terminal and use it in any coding agent
          seamlessly
        </Instruction>
        <CommandBox>
          <McpSetupCommand />
        </CommandBox>
      </CommandGroup>

      <Separator
        icon={<CursorClickIcon size={16} />}
        label="Or, create manually and connect later"
      />

      <CreateButton
        skin="primary"
        onClick={onCreateNotebook}
        dataHook={PRIMARY_BUTTON_HOOK}
      >
        Create new notebook
      </CreateButton>
    </BottomGroup>
  </LeftPane>
)
