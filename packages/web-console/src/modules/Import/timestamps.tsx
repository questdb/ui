import React from "react"
import styled from "styled-components"
import { PaneContent, PaneWrapper } from "../../components"
import { Panel } from "../../components/Panel"
import { TimestampFormatList } from "../../components/TimestampFormat/list"

type Props = {}

const Wrapper = styled(PaneWrapper)``

const Content = styled(PaneContent)``

export const GlobalTimestampsPanel  = ({}: Props) => {
    return (
        <Wrapper>
            <Panel.Header
                title={"Global timestamps"}
                shadow
            />
            <Content>
                <TimestampFormatList />
            </Content>
        </Wrapper>
    )
}