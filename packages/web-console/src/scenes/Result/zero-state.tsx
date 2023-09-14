import React from "react"
import { PaneContent, PaneWrapper } from "../../components"
import { Button } from "@questdb/react-components"
import { useDispatch } from "react-redux"
import { actions } from "../../store"

export const ZeroState = () => {
  const dispatch = useDispatch()

  return (
    <PaneWrapper>
      <PaneContent>
        <Button
          skin="secondary"
          onClick={() => dispatch(actions.console.setActivePanel("news"))}
        >
          Enterprise news
        </Button>
      </PaneContent>
    </PaneWrapper>
  )
}
