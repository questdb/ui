import {
  Text,
  Drawer,
  IconWithTooltip,
  Loader,
  PrimaryToggleButton,
} from "../../components"
import styled from "styled-components"
import React, { useEffect, useState, useContext } from "react"
import { QuestContext } from "../../providers"
import { NewsItem } from "../../utils"
import { useDispatch, useSelector } from "react-redux"
import { selectors, actions } from "../../store"
import ReactMarkdown from "react-markdown"
import { db } from "../../store/db"
import { UnreadItemsIcon } from "../../components/UnreadItemsIcon"
import { Thumbnail } from "./thumbnail"
import { Bell } from "./bell"
import { BUTTON_ICON_SIZE } from "../../consts"

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

const Item = styled.div<{ unread?: boolean }>`
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

  h2 {
    font-size: 1.8rem;
  }

  h3 {
    font-size: 1.6rem;
  }

  p,
  li {
    font-size: ${({ theme }) => theme.fontSize.lg};
    line-height: 1.75;
  }

  code {
    background-color: ${({ theme }) => theme.color.selection};
    color: ${({ theme }) => theme.color.pink};
    padding: 0.2rem 0.4rem;
    border-radius: 0.2rem;
  }

  li:not(:last-child) {
    margin-bottom: 0.5rem;
  }
`

const News = () => {
  const dispatch = useDispatch()
  const { quest } = useContext(QuestContext)
  const telemetryConfig = useSelector(selectors.telemetry.getConfig)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [enterpriseNews, setEnterpriseNews] = useState<NewsItem[] | undefined>(
    undefined,
  )
  const [newsOpened, setNewsOpened] = useState(false)
  // This is to mark new items in the sidebar
  const [unreadNewsIds, setUnreadNewsIds] = useState<string[]>([])
  // This boolean is to animate the bell icon and display a bullet indicator
  const [hasUnreadNews, setHasUnreadNews] = useState(false)
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)

  let hoverTimeout: NodeJS.Timeout

  const getEnterpriseNews = async () => {
    setIsLoading(true)
    setHasError(false)
    try {
      const news = await quest.getNews({
        category: "enterprise",
        telemetryConfig,
      })
      setEnterpriseNews(news)
    } catch (e) {
      setHasError(true)
    } finally {
      setIsLoading(false)
    }
  }

  const getUnreadNews = async () => {
    if (enterpriseNews) {
      const readNews = await db.read_notifications.toArray()
      const newsIds = enterpriseNews.map((newsItem) => newsItem.id)
      const unreadNews = newsIds.filter(
        (newsId) =>
          !readNews.find((readNewsItem) => readNewsItem.newsId === newsId),
      )
      setUnreadNewsIds(unreadNews)
      setHasUnreadNews(unreadNews?.length > 0)
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

  // Clear unread news indication when news are opened.
  // Clear `unreadNewsIds` only when user closes the news panel.
  useEffect(() => {
    if (enterpriseNews) {
      if (newsOpened) {
        void clearUnreadNews()
      } else {
        setUnreadNewsIds([])
      }
    }
  }, [newsOpened, enterpriseNews])

  useEffect(() => {
    setNewsOpened(activeSidebar === "news")
  }, [activeSidebar])

  return (
    <Drawer
      mode="side"
      title="QuestDB News"
      open={newsOpened}
      onOpenChange={async (newsOpened) => {
        dispatch(
          actions.console.setActiveSidebar(newsOpened ? "news" : undefined),
        )
      }}
      trigger={
        <IconWithTooltip
          icon={
            <PrimaryToggleButton
              data-hook="news-panel-button"
              onClick={() => setNewsOpened(!newsOpened)}
              selected={newsOpened}
            >
              <UnreadItemsIcon
                icon={<Bell size={BUTTON_ICON_SIZE} $unread={hasUnreadNews} />}
                tick={hasUnreadNews}
              />
            </PrimaryToggleButton>
          }
          placement="left"
          tooltip="QuestDB News"
        />
      }
    >
      <Drawer.ContentWrapper mode="side">
        <Items>
          {isLoading && !enterpriseNews && (
            <Loading>
              <Text color="foreground">Loading news...</Text>
              <Loader />
            </Loading>
          )}
          {hasError && (
            <Loading>
              <Text color="red">
                Error loading news. Please try again shortly.
              </Text>
            </Loading>
          )}
          {(!isLoading || enterpriseNews) &&
            !hasError &&
            enterpriseNews &&
            enterpriseNews.map((newsItem, index) => (
              <Item
                key={`${index}-${newsItem.title}`}
                unread={
                  unreadNewsIds.find((id) => newsItem.id === id) !== undefined
                }
              >
                <Title>{newsItem.title}</Title>
                <Text color="gray2">{newsItem.date}</Text>
                {newsItem.thumbnail &&
                  newsItem.thumbnail.length > 0 &&
                  newsItem.thumbnail[0].thumbnails.large && (
                    <Thumbnail
                      containerWidth={460}
                      containerHeight={460}
                      src={newsItem.thumbnail[0].thumbnails.large.url}
                      alt={`${newsItem.title} thumbnail`}
                      width={newsItem.thumbnail[0].thumbnails.large.width}
                      height={newsItem.thumbnail[0].thumbnails.large.height}
                      fadeIn={true}
                      {...(newsItem && newsItem.thumbnail
                        ? {
                            onMouseOver: () => {
                              if (newsItem.thumbnail) {
                                hoverTimeout = setTimeout(() => {
                                  if (newsItem && newsItem.thumbnail) {
                                    dispatch(
                                      actions.console.setImageToZoom({
                                        src: newsItem.thumbnail[0].thumbnails
                                          .large.url,
                                        width:
                                          newsItem.thumbnail[0].thumbnails.large
                                            .width,
                                        height:
                                          newsItem.thumbnail[0].thumbnails.large
                                            .height,
                                        alt: newsItem.title,
                                      }),
                                    )
                                  }
                                }, 500)
                              }
                            },
                            onMouseOut: () => {
                              clearTimeout(hoverTimeout)
                              setTimeout(() => {
                                dispatch(
                                  actions.console.setImageToZoom(undefined),
                                )
                              }, 250)
                            },
                          }
                        : {})}
                    />
                  )}

                <NewsText>
                  <ReactMarkdown
                    components={{
                      a: ({ children, ...props }: React.ComponentProps<"a">) => (
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
      </Drawer.ContentWrapper>
    </Drawer>
  )
}

export default News
