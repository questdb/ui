import { Text, Drawer, IconWithTooltip } from "../../components"
import styled from "styled-components"
import React, { useEffect, useState, useContext } from "react"
import { QuestContext } from "../../providers"
import { NewsItem } from "../../utils/questdb"
import { useDispatch, useSelector } from "react-redux"
import { selectors, actions } from "../../store"
import ReactMarkdown from "react-markdown"
import { Loader, Button } from "@questdb/react-components"
import { db } from "../../store/db"
import { UnreadItemsIcon } from "../../components/UnreadItemsIcon"
import { Thumbnail } from "./thumbnail"
import { Bell } from "./bell"

const Loading = styled.div`
  display: grid;
  grid-auto-flow: column;
  gap: 1rem;
  justify-self: center;
  margin-top: 2rem;
`

const Items = styled.div`
  display: grid;
  width: 100%;
  overflow: auto;
`

const Item = styled.div`
  display: grid;
  gap: 1rem;
  padding: 2rem;

  &:not(:last-child) {
    border-bottom: 1px solid ${({ theme }) => theme.color.backgroundLighter};
  }
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

const News = () => {
  const dispatch = useDispatch()
  const { quest } = useContext(QuestContext)
  const telemetryConfig = useSelector(selectors.telemetry.getConfig)
  const [enterpriseNews, setEnterpriseNews] = useState<NewsItem[] | undefined>(
    undefined,
  )
  const [newsOpened, setNewsOpened] = useState(false)
  const [hasUnreadNews, setHasUnreadNews] = useState(false)

  const getEnterpriseNews = async () => {
    const news = await quest.getNews({
      category: "enterprise",
      telemetryConfig,
    })
    setEnterpriseNews(news)
  }

  const getUnreadNews = async () => {
    if (enterpriseNews) {
      const readNews = await db.read_notifications.toArray()
      const newsIds = enterpriseNews.map((newsItem) => newsItem.id)
      const unreadNews = newsIds.filter(
        (newsId) =>
          !readNews.find((readNewsItem) => readNewsItem.newsId === newsId),
      )
      setHasUnreadNews(unreadNews?.length > 0 ? true : false)
    }
  }

  const clearUnreadNews = async () => {
    if (enterpriseNews) {
      const newsIds = enterpriseNews.map((newsItem) => newsItem.id)
      // filter newsIds that are already in the db
      const readNews = await db.read_notifications.toArray()
      const readNewsIds = readNews.map((readNewsItem) => readNewsItem.newsId)
      const filteredNewsIds = newsIds.filter(
        (newsId) => !readNewsIds.includes(newsId),
      )
      await db.read_notifications.bulkPut(
        filteredNewsIds.map((newsId) => ({ newsId })),
        { allKeys: true },
      )
      setHasUnreadNews(false)
    }
  }

  // Get Enterprise News on render
  useEffect(() => {
    void getEnterpriseNews()
    window.addEventListener("focus", getEnterpriseNews)
    return () => window.removeEventListener("focus", getEnterpriseNews)
  }, [])

  // Compute unread news
  useEffect(() => {
    if (enterpriseNews) {
      void getUnreadNews()
    }
  }, [enterpriseNews])

  // Clear unread news when news are opened
  useEffect(() => {
    if (newsOpened && enterpriseNews) {
      void clearUnreadNews()
    }
  }, [newsOpened, enterpriseNews])

  return (
    <Drawer
      mode="side"
      title="QuestDB News"
      withCloseButton
      onOpenChange={async (newsOpened) => {
        setNewsOpened(newsOpened)
        dispatch(
          actions.console.setActivePanel(newsOpened ? "news" : "console"),
        )
      }}
      trigger={
        <IconWithTooltip
          icon={
            <Button skin={newsOpened ? "secondary" : "transparent"}>
              <UnreadItemsIcon
                icon={<Bell size="18px" unread={hasUnreadNews} />}
                tick={hasUnreadNews}
              />
            </Button>
          }
          placement="bottom"
          tooltip="QuestDB News"
        />
      }
    >
      <Items>
        {enterpriseNews === undefined && (
          <Loading>
            <Text color="foreground">Loading news...</Text>
            <Loader />
          </Loading>
        )}
        {enterpriseNews &&
          enterpriseNews.map((newsItem, index) => (
            <Item key={`${index}-${newsItem.title}`}>
              <Title>{newsItem.title}</Title>
              <Text color="gray2">{newsItem.date}</Text>
              {newsItem.thumbnail &&
                newsItem.thumbnail.length > 0 &&
                newsItem.thumbnail[0].thumbnails.large && (
                  <Thumbnail
                    containerWidth={460}
                    src={newsItem.thumbnail[0].thumbnails.large.url}
                    alt={`${newsItem.title} thumbnail`}
                    width={newsItem.thumbnail[0].thumbnails.large.width}
                    height={newsItem.thumbnail[0].thumbnails.large.height}
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
    </Drawer>
  )
}

export default News
