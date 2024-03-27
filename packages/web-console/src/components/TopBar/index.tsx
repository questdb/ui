import React from "react"
import styled from "styled-components"
import Menu from "../../scenes/Editor/Menu"
import { Box } from "@questdb/react-components"
import { Toolbar } from "./toolbar"
import { BackButton } from "./back-button"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "../../store/db"

const Root = styled(Box).attrs({
  align: "center",
  justifyContent: "space-between",
})`
  width: 100%;
  height: 4.5rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
`

export const TopBar = () => {
  const editorSettings = useLiveQuery(
    async () => ({
      returnTo:
        (await db.editor_settings.where("key").equals("returnTo").first())
          ?.value ?? "",

      returnToLabel:
        (await db.editor_settings.where("key").equals("returnToLabel").first())
          ?.value ?? "",
    }),
    [],
  )

  return (
    <Root>
      {editorSettings?.returnTo && (
        <BackButton
          label={editorSettings?.returnToLabel}
          onClick={() => {
            window.location.href = editorSettings.returnTo as string
          }}
        />
      )}
      <Toolbar />
      <Menu />
    </Root>
  )
}
