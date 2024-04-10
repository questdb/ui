import React, { useContext, useEffect, useState } from "react"
import styled from "styled-components"
import { Start } from "../../modules/ZeroState/start"
import { PaneContent, PaneWrapper } from "../../components"
import * as QuestDB from "../../utils/questdb"
import { QuestContext } from "../../providers"

const StyledPaneContent = styled(PaneContent)`
  align-items: center;
  justify-content: center;
`

export const ZeroState = () => {
  const { quest } = useContext(QuestContext)
  const [loading, setLoading] = useState(true)
  const [tables, setTables] = useState<QuestDB.Table[]>([])
  const [walTables, setWalTables] = useState<QuestDB.WalTable[]>([])

  const fetchTables = async () => {
    try {
      const response = await quest.showTables()
      if (response && response.type === QuestDB.Type.DQL) {
        setTables(response.data)
      }
    } catch (error) {
      return
    } finally {
      setLoading(false)
    }
  }

  const fetchWalTables = async () => {
    try {
      const response = await quest.showWalTables()
      if (response && response.type === QuestDB.Type.DQL) {
        setWalTables(response.data)
      }
    } catch (error) {
      return
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchTables()
    void fetchWalTables
  }, [])

  return (
    <PaneWrapper>
      <StyledPaneContent>
        {!loading && tables.length <= 2 && <Start />}
      </StyledPaneContent>
    </PaneWrapper>
  )
}
