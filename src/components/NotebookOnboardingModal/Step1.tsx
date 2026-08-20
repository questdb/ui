import React from "react"
import styled from "styled-components"
import { ChartBarIcon, GridNineIcon, RobotIcon } from "@phosphor-icons/react"
import { Button } from "../Button"
import { color } from "../../utils"
import {
  Badge,
  BottomGroup,
  Bullet,
  BulletList,
  ButtonRow,
  LeftPane,
  PRIMARY_BUTTON_HOOK,
  Separator,
  Subtitle,
  Title,
  TitleRow,
} from "./shared"

const FooterButton = styled(Button)`
  flex: 1;
  height: auto;
  min-height: 3.2rem;
  padding: 0.6rem 2rem;
  border-radius: 0.4rem;
  font-size: 1.4rem;
  font-weight: 500;
`

const CreateButton = styled(FooterButton)`
  && {
    background: ${color("surfaceInset")};
    border-color: ${color("borderDefault")};
    color: ${color("contentSecondary")};
  }

  &&:hover:not([disabled]) {
    background: ${color("interactionNeutral")};
    border-color: ${color("borderDefault")};
    color: ${color("contentPrimary")};
  }
`

const Bottom = styled(BottomGroup)`
  margin-top: auto;
`

export const Step1 = ({
  onCreateNotebook,
  onNext,
}: {
  onCreateNotebook: () => void
  onNext: () => void
}) => (
  <LeftPane>
    <div>
      <TitleRow>
        <Title>Introducing Notebooks</Title>
        <Badge>New</Badge>
      </TitleRow>
      <Subtitle>Group your queries, results, and charts in one place.</Subtitle>
    </div>

    <BulletList>
      <Bullet icon={<GridNineIcon size={20} />} title="A new way to organise">
        Each notebook opens as its own tab beside your SQL editor: queries,
        results, and charts as cells you can revisit anytime and share with
        coworkers.
      </Bullet>
      <Bullet
        icon={<ChartBarIcon size={20} />}
        title="Build responsive dashboards"
      >
        Flip to grid mode and arrange cells into a live, auto-refreshing
        dashboard. Drag, drop, resize.
      </Bullet>
    </BulletList>

    <Bottom>
      <Separator
        icon={<RobotIcon size={16} />}
        label="Plus, AI agents can build it for you"
      />
      <ButtonRow>
        <CreateButton variant="secondary" onClick={onCreateNotebook}>
          Create notebook
        </CreateButton>
        <FooterButton
          variant="primary"
          onClick={onNext}
          dataHook={PRIMARY_BUTTON_HOOK}
        >
          Next
        </FooterButton>
      </ButtonRow>
    </Bottom>
  </LeftPane>
)
