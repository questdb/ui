import React, { ReactNode } from "react"
import styled from "styled-components"
import { color } from "../../utils"

export const PRIMARY_BUTTON_HOOK = "onboarding-primary"

export const LeftPane = styled.div<{ $center?: boolean }>`
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 2rem;
  padding: 3.2rem 3.2rem 2.8rem;
  overflow-y: auto;
  ${({ $center }) => $center && "justify-content: safe center;"}
`

export const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
`

export const Title = styled.h2`
  margin: 0;
  font-size: 2.25rem;
  font-weight: 600;
  line-height: 1.4;
  color: ${color("foreground")};
`

export const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 2.4rem;
  padding: 0 1.1rem;
  border: 1px solid ${color("pinkBadge")};
  border-bottom-width: 2px;
  border-radius: 0.25rem;
  font-size: 1.3rem;
  font-weight: 500;
  line-height: 1;
  color: ${color("pinkBadge")};
`

export const Subtitle = styled.p`
  margin: 0.7rem 0 0;
  font-size: 1.4rem;
  line-height: 1.5;
  color: ${color("gray2")};
`

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  padding-top: 1rem;
`

const Item = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 1.2rem;
`

const ItemIcon = styled.div`
  display: flex;
  padding-top: 0.2rem;
  color: ${color("pink")};
`

const ItemBody = styled.div`
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 0.2rem;
`

const ItemTitle = styled.p`
  margin: 0;
  font-size: 1.4rem;
  font-weight: 500;
  color: ${color("foreground")};
`

const ItemText = styled.p`
  margin: 0;
  font-size: 1.28rem;
  line-height: 1.5;
  color: ${color("mutedLabel")};
`

export const BulletList = ({ children }: { children: ReactNode }) => (
  <List>{children}</List>
)

export const Bullet = ({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) => (
  <Item>
    <ItemIcon>{icon}</ItemIcon>
    <ItemBody>
      <ItemTitle>{title}</ItemTitle>
      <ItemText>{children}</ItemText>
    </ItemBody>
  </Item>
)

const SeparatorRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.4rem;
`

const SeparatorLine = styled.div`
  flex: 1;
  height: 1px;
  background: ${color("selection")};
`

const SeparatorLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  color: ${color("mutedLabel")};
  font-size: 1.3rem;
  white-space: nowrap;
`

export const Separator = ({
  icon,
  label,
}: {
  icon: ReactNode
  label: string
}) => (
  <SeparatorRow>
    <SeparatorLine />
    <SeparatorLabel>
      {icon}
      {label}
    </SeparatorLabel>
    <SeparatorLine />
  </SeparatorRow>
)

export const BottomGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
`

export const ButtonRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1.6rem;
  width: 100%;
`
