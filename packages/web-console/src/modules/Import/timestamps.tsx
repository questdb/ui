import React from "react"
import styled from "styled-components"
import { PaneContent, PaneWrapper } from "../../components"
import { TimestampFormatList } from "../../components/TimestampFormat/list"
import { Nav, NavGroup, Subheader } from "./panel"
import { ArrowLeftS, ArrowRightS } from "@styled-icons/remix-line"
import { useFieldArray, useFormContext } from "react-hook-form"
import { withTooltip } from "../../utils"

type Props = {
  toggle: () => void
}

const Wrapper = styled(PaneWrapper)``

const Content = styled(PaneContent)``

export const GlobalTimestampsPanel = ({ toggle }: Props) => {
  const { watch, setValue } = useFormContext()
  const { fields, append, remove, update } = useFieldArray({
    name: "formats.patterns",
  })
  const override = watch("formats.behavior", "ADD") === "OVERRIDE"

  return (
    <Wrapper>
      <Subheader>
        <NavGroup>
          <Nav
            onClick={(e) => {
              setValue("formats.behavior", override ? "ADD" : "OVERRIDE")
            }}
          >
            <span>Override builtins</span>{" "}
            <small
              style={{
                opacity: +override,
              }}
            >
              ✔
            </small>
          </Nav>
          {withTooltip(
            <Nav
              onClick={(e) => {
                append({ pattern: "" })
              }}
            >
              +
            </Nav>,
            "Add new",
            { placement: "top" },
          )}
        </NavGroup>
        <NavGroup>
          {withTooltip(
            <Nav
              onClick={(e) => {
                e.preventDefault()
                toggle()
              }}
            >
              <ArrowLeftS size="18px" />
            </Nav>,
            "Collapse menu",
            { placement: "top" },
          )}
        </NavGroup>
      </Subheader>
      <Content>
        <TimestampFormatList {...{ fields, remove, update }} />
      </Content>
    </Wrapper>
  )
}

GlobalTimestampsPanel.Collapsed = ({ toggle }: Props) => (
  <Wrapper>
    <Subheader>
      <Nav onClick={() => toggle()}>
        <ArrowRightS size="18px" />
      </Nav>
    </Subheader>
  </Wrapper>
)
