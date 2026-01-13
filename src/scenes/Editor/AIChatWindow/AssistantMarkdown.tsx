import React, { memo, useMemo } from "react"
import styled from "styled-components"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { LiteEditor } from "../../../components/LiteEditor"
import type { OpenInEditorContent } from "./ChatMessages"
import { color } from "../../../utils"

const CodeBlockWrapper = styled.div`
  margin: 1rem 0;
  width: 100%;
`

const MarkdownContent = styled.div`
  margin: 0;
  width: 100%;
  font-family: ${({ theme }) => theme.font};
  font-size: 1.4rem;
  line-height: 2.1rem;
  color: ${color("foreground")};
  overflow: visible;
  word-break: break-word;

  p {
    margin: 0 0 1rem 0;
    &:last-child {
      margin-bottom: 0;
    }
  }

  code {
    background: ${color("background")};
    border: 1px solid ${color("selection")};
    border-radius: 0.4rem;
    padding: 0.1rem 0.4rem;
    font-family: ${({ theme }) => theme.fontMonospace};
    font-size: 1.3rem;
    color: ${color("purple")};
    white-space: pre-wrap;
  }

  strong {
    font-weight: 600;
    color: ${color("foreground")};
  }

  em {
    font-style: italic;
  }

  ul,
  ol {
    margin: 0.5rem 0;
    padding-left: 2rem;
  }

  li {
    margin-bottom: 0.3rem;
  }

  a {
    color: ${({ theme }) => theme.color.cyan};
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }

  h1,
  h2,
  h3,
  h4 {
    margin: 1rem 0 0.5rem 0;
    font-weight: 600;
  }

  h1 {
    font-size: 1.8rem;
  }
  h2 {
    font-size: 1.6rem;
  }
  h3 {
    font-size: 1.5rem;
  }
  h4 {
    font-size: 1.4rem;
  }

  blockquote {
    border-left: 3px solid ${color("selection")};
    margin: 1rem 0;
    padding-left: 1rem;
    color: ${color("gray2")};
  }

  .table-wrapper {
    overflow-x: auto;
    margin: 1rem 0;
  }

  table {
    border-collapse: collapse;
    min-width: max-content;
    border-radius: 0.8rem;
  }

  th,
  td {
    padding: 0.6rem 0.8rem;
    border: 1px solid ${color("selection")};
    text-align: left;
    white-space: nowrap;
  }

  th {
    background: ${color("backgroundDarker")};
    font-weight: 600;
  }

  td:last-child {
    white-space: normal;
    min-width: 200px;
  }
`

export const AssistantMarkdown = memo(
  ({
    content,
    messageId,
    onOpenInEditor,
  }: {
    content: string
    messageId: string
    onOpenInEditor?: (content: OpenInEditorContent) => void
  }) => {
    const components = useMemo(
      () => ({
        a: ({ children, href, ...props }: React.ComponentProps<"a">) => (
          <a
            {...(typeof href === "string" && href.startsWith("http")
              ? {
                  target: "_blank",
                  rel: "noopener noreferrer",
                }
              : {})}
            href={href}
            {...props}
          >
            {children}
          </a>
        ),
        table: ({ children, ...props }: React.ComponentProps<"table">) => (
          <div className="table-wrapper">
            <table {...props}>{children}</table>
          </div>
        ),
        // Render pre as fragment since code blocks are handled by code component
        pre: ({ children }: React.ComponentProps<"pre">) => <>{children}</>,
        code: ({ children, className }: React.ComponentProps<"code">) => {
          // Check if this is a code block (has language class) or inline code
          const isCodeBlock =
            typeof className === "string" && className.includes("language-")
          if (isCodeBlock) {
            const codeContent = (
              Array.isArray(children)
                ? children.join("")
                : typeof children === "string"
                  ? children
                  : ""
            ).replace(/\n$/, "")
            const lineCount = codeContent.split("\n").length
            // LiteEditor has 8px padding top and bottom (16px total)
            const maxHeight = 216
            const originalHeight = lineCount * 20 + 16
            const editorHeight = Math.min(originalHeight, maxHeight)
            // Show "Open in editor" button when content exceeds max height
            const shouldShowOpenInEditor = originalHeight > maxHeight
            return (
              <CodeBlockWrapper
                key={`${messageId}-${codeContent.slice(0, 50)}`}
                style={{ height: editorHeight }}
                data-hook="chat-message-code-block"
              >
                <LiteEditor
                  value={codeContent}
                  onOpenInEditor={
                    shouldShowOpenInEditor && onOpenInEditor
                      ? () =>
                          onOpenInEditor({
                            type: "code",
                            value: codeContent,
                          })
                      : undefined
                  }
                />
              </CodeBlockWrapper>
            )
          }
          // Inline code - render as default
          return <code>{children}</code>
        },
      }),
      [messageId, onOpenInEditor],
    )

    return (
      <MarkdownContent>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
      </MarkdownContent>
    )
  },
  (prevProps, nextProps) =>
    prevProps.content === nextProps.content &&
    prevProps.messageId === nextProps.messageId,
)
