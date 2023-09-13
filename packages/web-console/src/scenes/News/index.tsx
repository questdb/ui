import React from "react"
import { Page } from "../../components"
import styled from "styled-components"
import { Settings2 } from "styled-icons/evaicons-solid"
import { color } from "../../utils"

const Icon = styled(Settings2)`
  color: ${color("foreground")};
`

const News = () => {
  return (
    <Page title="News" icon={<Icon size="20px" />}>
      news
    </Page>
  )
}

export default News
