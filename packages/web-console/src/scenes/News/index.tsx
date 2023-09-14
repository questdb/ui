import React from "react"
import { Page, Text } from "../../components"
import styled from "styled-components"
import { Settings2 } from "styled-icons/evaicons-solid"
import { color } from "../../utils"
import { useEffect, useState, useContext } from "react"
import { QuestContext } from "../../providers"
import { NewsItem } from "../../utils/questdb"
import { useSelector } from "react-redux"
import { selectors } from "../../store"
import { Heading } from "@questdb/react-components"
import ReactMarkdown from "react-markdown"

const Items = styled.div`
  background: ${({ theme }) => theme.color.backgroundLighter};
  display: grid;
  grid-auto-rows: max-content;
  gap: 4rem;
  padding: 4rem 2rem;
  width: 100%;
  height: 100%;
  justify-items: center;
  overflow: auto;
`

const Item = styled.div`
  display: grid;
  gap: 1rem;
  width: 75%;
`

const Icon = styled(Settings2)`
  color: ${color("foreground")};
`

const NewsText = styled(Text).attrs({ color: "foreground" })`
  a {
    color: ${({ theme }) => theme.color.cyan};
  }

  code {
    background-color: ${({ theme }) => theme.color.selection};
    padding: 0.2rem 0.4rem;
    border-radius: 0.2rem;
  }
`

const Thumbnail = styled.img`
  max-width: 500px;
  margin: 2rem 0;
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: 0 7px 30px -10px ${({ theme }) => theme.color.black};
`

const News = () => {
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

  return (
    <Page title="News" icon={<Icon size="20px" />}>
      <Items>
        {enterpriseNews.map((newsItem, index) => (
          <Item key={`${index}-${newsItem.title}`}>
            <Heading level={2}>{newsItem.title}</Heading>
            <Text color="gray2">{newsItem.date}</Text>
            {newsItem.thumbnail &&
              newsItem.thumbnail.length > 0 &&
              newsItem.thumbnail[0].thumbnails.large && (
                <Thumbnail
                  src={newsItem.thumbnail[0].thumbnails.large.url}
                  alt={`${newsItem.title} thumbnail`}
                />
              )}

            <NewsText>
              <ReactMarkdown
                components={{
                  a: ({ node, children, ...props }) => (
                    <a
                      {...(props.href?.startsWith("http")
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      {...props}
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {newsItem.body}
              </ReactMarkdown>
            </NewsText>
          </Item>
        ))}
      </Items>
    </Page>
  )
}

export default News
