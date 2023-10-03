import React from "react"
import { Text } from "../../components"
import styled from "styled-components"
import { useEffect, useState, useContext } from "react"
import { QuestContext } from "../../providers"
import { NewsItem } from "../../utils/questdb"
import { useSelector } from "react-redux"
import { selectors } from "../../store"
import ReactMarkdown from "react-markdown"

const Items = styled.div`
  display: grid;
  grid-auto-rows: max-content;
  gap: 4rem;
  width: 100%;
  justify-items: center;
  overflow: auto;
`

const Item = styled.div`
  display: grid;
  gap: 1rem;
  padding: 2rem;
`

const Title = styled.h2`
  margin: 0;
  font-size: 2rem;
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
  max-width: 100%;
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
    <Items>
      {enterpriseNews.map((newsItem, index) => (
        <Item key={`${index}-${newsItem.title}`}>
          <Title>{newsItem.title}</Title>
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
  )
}

export default News
