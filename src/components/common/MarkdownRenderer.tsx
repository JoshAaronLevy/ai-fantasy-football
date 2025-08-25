import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = ''
}) => {
  const combinedClassName = `prose prose-sm max-w-none ${className}`.trim()

  return (
    <div className="overflow-x-auto">
      <div className={combinedClassName}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[
            [rehypeSanitize, {
              tagNames: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
              attributes: {
                a: ['href', 'target', 'rel'],
                '*': ['className']
              },
              protocols: {
                href: ['http', 'https', 'mailto', 'tel']
              }
            }]
          ]}
          components={{
            table: ({ children, ...props }) => (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full text-sm border-collapse border border-gray-300" {...props}>
                  {children}
                </table>
              </div>
            ),
            thead: ({ children, ...props }) => (
              <thead className="bg-gray-50" {...props}>
                {children}
              </thead>
            ),
            th: ({ children, ...props }) => (
              <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-900" {...props}>
                {children}
              </th>
            ),
            td: ({ children, ...props }) => (
              <td className="border border-gray-300 px-3 py-2 text-gray-700" {...props}>
                {children}
              </td>
            ),
            tr: ({ children, ...props }) => (
              <tr className="even:bg-gray-50" {...props}>
                {children}
              </tr>
            ),
            a: ({ children, href, ...props }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
                {...props}
              >
                {children}
              </a>
            )
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  )
}