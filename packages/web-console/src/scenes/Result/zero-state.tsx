import React, { useEffect, useState } from "react"
import { useContext } from "react"
import { QuestContext } from "../../providers"
import { NewsItem } from "../../utils/questdb"

import { PaneContent, PaneWrapper } from "../../components"
import { useSelector } from "react-redux"
import { selectors } from "../../store"

export const ZeroState = () => {
  const { quest } = useContext(QuestContext)
  const telemetryConfig = useSelector(selectors.telemetry.getConfig)
  const [enterpriseNews, setEnterpriseNews] = useState<NewsItem[]>([])

  useEffect(() => {
    void quest
      .getNews({ category: "enterprise", telemetryConfig })
      .then((news: NewsItem[]) => {
        setEnterpriseNews(news)
      })
  }, [])

  console.log(enterpriseNews)

  return (
    <PaneWrapper>
      <PaneContent>result zero state</PaneContent>
    </PaneWrapper>
  )
}
