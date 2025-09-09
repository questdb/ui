import React from "react"
import styled from "styled-components"
import { Close } from "@styled-icons/remix-line"

import { color } from "../../../utils"

type Props = Readonly<{
  onClick: () => void
}>

const Wrapper = styled.div`
  box-sizing: content-box;
  position: fixed;
  display: flex;
  bottom: 1.6rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.4rem 1.5rem;
  align-items: center;
  justify-content: center;
  background: ${color("pinkPrimary")};
  overflow: hidden;
  border-radius: 10rem;
  max-width: none;
  white-space: nowrap;
  min-width: fit-content;
`

const Text = styled.p`
  font-size: 1.5rem;
  color: ${color("white")};
  margin: 0 5rem 0 0;

  @media (max-width: 700px) {
    display: none;
  }
`

const DownloadLink = styled.a`
  display: inline-flex;
  height: 3rem;
  padding: 0 1.3rem;
  align-items: center;
  justify-content: center;
  background: ${color("white")};
  border-radius: 4px;
  border: 1px solid ${color("white")};
  outline: 0;
  font-weight: 700;
  line-height: 1.15;
  cursor: pointer;
  text-decoration: none;
  margin-right: 2rem;
  font-size: 13.13px;
  color: ${color("black")};

  &:hover {
    background: ${color("white")} !important;
    border-color: ${color("white")} !important;
    text-decoration: underline;
    color: ${color("black")} !important;
  }

  @media (max-width: 700px) {
    margin-left: 1rem;
  }
`

const EnterpriseLink = styled.a`
  font-size: 13.13px;
  font-weight: 700;
  color: ${color("white")};
  text-decoration: none;
  margin-right: 2rem;

  &:hover {
    text-decoration: underline;
  }

  @media (max-width: 700px) {
    display: none;
  }
`

const EnterpriseLinkSmall = styled(EnterpriseLink)`
  display: none;

  @media (max-width: 700px) {
    display: block;
  }
`

const CloseIcon = styled(Close)`
  color: ${color("white")};
  cursor: pointer;
`

const CtaBanner = ({ onClick }: Props) => (
  <Wrapper>
    <Text>Ready to get started?</Text>
    <DownloadLink
      href="https://questdb.com/download"
      target="_blank"
      rel="noopener noreferrer"
    >
      Download
    </DownloadLink>
    <EnterpriseLink href="https://questdb.com/enterprise" target="_blank" rel="noopener noreferrer">
      Learn more about QuestDB Enterprise &rarr;
    </EnterpriseLink>
    <EnterpriseLinkSmall href="https://questdb.com/enterprise" target="_blank" rel="noopener noreferrer">
      QuestDB Enterprise &rarr;
    </EnterpriseLinkSmall>
    <CloseIcon onClick={onClick} size="22px" />
  </Wrapper>
)

export default CtaBanner
