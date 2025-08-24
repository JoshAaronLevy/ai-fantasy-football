import React from 'react'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

interface MarkdownRendererProps {
  content: string
  className?: string
}

// Configure markdown-it with safe settings
const md = new MarkdownIt({
  html: false,      // No raw HTML
  linkify: true,    // Convert URLs to links
  breaks: false     // No line breaks conversion
})

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ 
  content, 
  className = '' 
}) => {
  const sanitizedHtml = React.useMemo(() => {
    // Render markdown to HTML
    const rawHtml = md.render(content)
    
    // Only sanitize on the client
    if (typeof window === 'undefined') {
      return rawHtml
    }
    
    // Sanitize with DOMPurify - only allow minimal tags
    const cleanHtml = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ['p', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      // Hook to ensure proper rel attributes on external links
      HOOK_AFTER_SANITIZE: (fragment) => {
        const links = fragment.querySelectorAll('a[target="_blank"]')
        links.forEach((link) => {
          const rel = link.getAttribute('rel') || ''
          const relTokens = new Set(rel.split(/\s+/).filter(Boolean))
          relTokens.add('noopener')
          relTokens.add('noreferrer')
          link.setAttribute('rel', Array.from(relTokens).join(' '))
        })
      }
    })
    
    return cleanHtml
  }, [content])

  const combinedClassName = `prose whitespace-pre-wrap ${className}`.trim()

  return (
    <div 
      className={combinedClassName}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  )
}