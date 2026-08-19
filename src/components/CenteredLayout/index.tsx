import React from "react"
import styled from "styled-components"
import { Text } from "../Text"
import { Badge } from "../Badge"
import { useSettings } from "../../providers"

const Root = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  margin-bottom: auto;
  overflow-y: auto;
  background: ${({ theme }) => theme.color.authBackdrop};
`

const Main = styled.div`
  margin-top: auto;
  position: relative;
`

const GridBackground = styled.img`
  position: absolute;
  z-index: 0;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
`

const MainContent = styled.div`
  position: relative;
  z-index: 1;
`

const Footer = styled.div`
  text-align: center;
  align-items: center;
  display: flex;
  gap: 2rem;
  margin-bottom: 2rem;
  margin-top: auto;
`

const VersionBadge = styled(Badge).attrs({
  variant: "accent",
  size: "md",
})``

export const CenteredLayout = ({
  children,
  preloadedImages,
}: {
  children: React.ReactNode
  preloadedImages?: Record<string, string>
}) => {
  const { settings } = useSettings()
  return (
    <Root>
      <Main>
        <GridBackground
          src={
            preloadedImages?.["assets/grid-bg.webp"] || "assets/grid-bg.webp"
          }
          alt=""
          aria-hidden="true"
          width="100%"
          height="100%"
        />
        <MainContent>{children}</MainContent>
      </Main>
      <Footer>
        <Text size="sm" color="contentSecondary">
          Copyright &copy; {new Date().getFullYear()} QuestDB. All rights
          reserved.
        </Text>
        {settings["release.type"] && (
          <VersionBadge>
            <Text size="sm" color="contentSecondary">
              QuestDB {settings["release.type"] === "EE" ? "Enterprise" : ""}{" "}
              {settings["release.version"]}
            </Text>
          </VersionBadge>
        )}
      </Footer>
    </Root>
  )
}
