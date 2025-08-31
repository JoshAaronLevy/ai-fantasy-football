import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { ScrollPanel } from 'primereact/scrollpanel'
import { Accordion, AccordionTab } from 'primereact/accordion'
import { Tag } from 'primereact/tag'
import { ProgressSpinner } from 'primereact/progressspinner'
import { MarkdownRenderer } from '../common/MarkdownRenderer'

interface ConversationHistoryProps {
  messages: Array<{ 
    id: string; 
    role: 'user' | 'assistant' | 'system'; 
    content: string; 
    ts?: number;
    // Extended properties to maintain compatibility with existing functionality
    type?: 'strategy' | 'player-taken' | 'user-turn' | 'loading' | 'analysis' | 'query';
    player?: { name: string };
    round?: number;
    pick?: number;
    meta?: { round: number; pick: number; playerCount?: number };
    // For query-type messages
    user?: string;
    ai?: string;
    messageNumber?: number;
  }>;
  onScroll?: (info: { atBottom: boolean }) => void;
}

export interface ConversationHistoryRef {
  scrollToBottom: (smooth?: boolean) => void;
}

// ACK message detection function
function isAckMessage(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.indexOf('TAKEN:') === 0 ||
         trimmed.indexOf('DRAFTED:') === 0 ||
         trimmed.indexOf('RESET:') === 0;
}

// ACK chip styling function
function getAckChipStyles(content: string): string {
  const trimmed = content.trim();
  if (trimmed.indexOf('TAKEN:') === 0) {
    return 'bg-blue-100 text-blue-800 px-3 py-2 rounded-full text-sm inline-block font-medium';
  }
  if (trimmed.indexOf('DRAFTED:') === 0) {
    return 'bg-green-100 text-green-800 px-3 py-2 rounded-full text-sm inline-block font-medium';
  }
  if (trimmed.indexOf('RESET:') === 0) {
    return 'bg-gray-100 text-gray-800 px-3 py-2 rounded-full text-sm inline-block font-medium';
  }
  return 'bg-gray-100 text-gray-800 px-3 py-2 rounded-full text-sm inline-block font-medium';
}

// Format timestamp function
const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
  return date.toLocaleDateString()
}

// Get message icon function
const getMessageIcon = (type?: string) => {
  switch (type) {
    case 'strategy': return 'pi-lightbulb'
    case 'player-taken': return 'pi-user-minus'
    case 'user-turn': return 'pi-user-plus'
    case 'loading': return 'pi-spin pi-spinner'
    case 'query': return 'pi-comment'
    default: return 'pi-comment'
  }
}

// Get message title function
const getMessageTitle = (type?: string) => {
  switch (type) {
    case 'strategy': return 'Draft Strategy'
    case 'player-taken': return 'Player Taken Analysis'
    case 'user-turn': return 'Your Turn Analysis'
    case 'loading': return 'Analyzing...'
    case 'query': return 'User Query'
    default: return 'AI Analysis'
  }
}

// Generate accordion title for message
const getAccordionTitle = (message: ConversationHistoryProps['messages'][0]) => {
  if (message.type === 'strategy') {
    return 'Draft Strategy'
  }
  
  if (message.type === 'analysis' && message.meta) {
    const playerCount = message.meta.playerCount || 'Unknown'
    return `Round ${message.meta.round} - ${playerCount} Players`
  }
  
  if (message.type === 'query' && message.round && message.messageNumber) {
    return `Round ${message.round}: User Query (${message.messageNumber})`
  }
  
  // Fallback for other message types
  return getMessageTitle(message.type)
}

export const ConversationHistory = forwardRef<ConversationHistoryRef, ConversationHistoryProps>(
  ({ messages, onScroll }, ref) => {
    const scrollPanelRef = useRef<ScrollPanel>(null)

    useImperativeHandle(ref, () => ({
      scrollToBottom: (smooth = false) => {
        if (scrollPanelRef.current) {
          const element = scrollPanelRef.current.getElement()
          if (element) {
            const scrollContainer = element.querySelector('.p-scrollpanel-content')
            if (scrollContainer) {
              scrollContainer.scrollTo({
                top: scrollContainer.scrollHeight,
                behavior: smooth ? 'smooth' : 'auto'
              })
            }
          }
        }
      }
    }))

    useEffect(() => {
      const handleScroll = () => {
        if (onScroll && scrollPanelRef.current) {
          const element = scrollPanelRef.current.getElement()
          if (element) {
            const scrollContainer = element.querySelector('.p-scrollpanel-content')
            if (scrollContainer) {
              const { scrollTop, scrollHeight, clientHeight } = scrollContainer
              const atBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10
              onScroll({ atBottom })
            }
          }
        }
      }

      const scrollPanel = scrollPanelRef.current?.getElement()
      const scrollContainer = scrollPanel?.querySelector('.p-scrollpanel-content')
      
      if (scrollContainer) {
        scrollContainer.addEventListener('scroll', handleScroll)
        return () => scrollContainer.removeEventListener('scroll', handleScroll)
      }
    }, [onScroll])

    // Sort messages by timestamp
    const sortedMessages = [...messages].sort((a, b) => {
      const aTime = a.ts || Date.now()
      const bTime = b.ts || Date.now()
      return aTime - bTime
    })

    // Default to only the last accordion item being expanded
    const defaultActiveIndex = sortedMessages.length > 0 ? [sortedMessages.length - 1] : []

    if (messages.length === 0) {
      return null
    }

    return (
      <div className="h-full flex flex-col relative">
        <ScrollPanel
          ref={scrollPanelRef}
          style={{ width: '100%', height: '100%' }}
          className="pr-4"
        >
          <Accordion
            multiple
            activeIndex={defaultActiveIndex}
            className="light-theme-accordion"
            style={{
              '--p-accordion-header-background': '#ffffff',
              '--p-accordion-header-hover-background': '#f8f9fa',
              '--p-accordion-header-active-background': '#e3f2fd',
              '--p-accordion-header-border-color': '#dee2e6',
              '--p-accordion-header-color': '#495057',
              '--p-accordion-header-hover-color': '#212529',
              '--p-accordion-content-background': '#ffffff',
              '--p-accordion-content-border-color': '#dee2e6',
              '--p-accordion-content-color': '#495057',
              '--p-accordion-toggle-icon-color': '#6c757d',
              '--p-accordion-toggle-icon-hover-color': '#495057'
            } as React.CSSProperties}
          >
            {sortedMessages.map((message) => (
              <AccordionTab
                key={message.id}
                header={
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <i className={`pi ${getMessageIcon(message.type)} text-blue-600`}></i>
                      <span className="font-semibold text-gray-800">{getAccordionTitle(message)}</span>
                      {message.player && (
                        <Tag
                          value={message.player.name}
                          severity="info"
                          className="text-xs"
                        />
                      )}
                    </div>
                    <span className="text-xs text-gray-500 ml-2">
                      {formatTimestamp(message.ts || Date.now())}
                    </span>
                  </div>
                }
                style={{
                  backgroundColor: '#ffffff',
                  borderColor: '#dee2e6'
                }}
                className="light-theme-accordion-tab"
              >
                <div className="p-4 bg-white border-gray-200">
                  {message.type === 'query' && message.user && message.ai ? (
                    // Render query-type messages (user/ai pairs)
                    <div className="space-y-4">
                      <div>
                        <div className="text-sm font-medium text-gray-800 mb-2">User:</div>
                        <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                          {message.user}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-blue-800 mb-2">AI Assistant:</div>
                        <div className="text-sm text-gray-700">
                          <MarkdownRenderer
                            content={message.ai}
                            className="prose max-w-none text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Render regular conversation messages
                    <>
                      {message.type === 'loading' ? (
                        <div className="flex items-center gap-2">
                          <ProgressSpinner style={{ width: '20px', height: '20px' }} strokeWidth="4" />
                          <span className="text-sm text-gray-600">Analyzing draft situation...</span>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-700 leading-relaxed">
                          {isAckMessage(message.content) ? (
                            <div className={getAckChipStyles(message.content)}>
                              {message.content.trim()}
                            </div>
                          ) : message.type === 'strategy' && (!message.content || message.content.trim().length === 0) ? (
                            <div className="text-gray-500 italic">
                              Click Initialize Draft to generate a bespoke AI draft strategy.
                            </div>
                          ) : (
                            <MarkdownRenderer
                              content={message.content}
                              className="prose max-w-none text-sm"
                            />
                          )}
                        </div>
                      )}
                      
                      {message.round && message.pick && (
                        <div className="mt-3 pt-2 border-t border-gray-200">
                          <span className="text-xs text-gray-500">
                            Round {message.round}, Pick {message.pick}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </AccordionTab>
            ))}
          </Accordion>
        </ScrollPanel>
      </div>
    )
  }
)

ConversationHistory.displayName = 'ConversationHistory'