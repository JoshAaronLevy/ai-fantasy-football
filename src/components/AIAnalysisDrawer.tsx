import React, { useRef, useState, useEffect } from 'react'
import { Sidebar } from 'primereact/sidebar'
import { Card } from 'primereact/card'
import { Tag } from 'primereact/tag'
import { ScrollPanel } from 'primereact/scrollpanel'
import { Button } from 'primereact/button'
import { ProgressSpinner } from 'primereact/progressspinner'
import { useDraftStore } from '../state/draftStore'
import { MarkdownRenderer } from './common/MarkdownRenderer'
import type { ConversationMessage } from '../types'

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

interface AIAnalysisDrawerProps {
  visible: boolean;
  onHide: () => void;
}

export const AIAnalysisDrawer: React.FC<AIAnalysisDrawerProps> = ({ visible, onHide }) => {
  const myTeam = useDraftStore((s) => s.myTeam)
  const getTotalDraftedCount = useDraftStore((s) => s.getTotalDraftedCount)
  const conversationId = useDraftStore((s) => s.conversationId)
  const draftInitialized = useDraftStore((s) => s.draftInitialized)
  const conversationMessages = useDraftStore((s) => s.conversationMessages)
  const isApiLoading = useDraftStore((s) => s.isApiLoading)
  const aiAnswer = useDraftStore((s) => s.aiAnswer)
  
  // Scroll management state and refs
  const scrollPanelRef = useRef<ScrollPanel>(null)
  const [isUserAtBottom, setIsUserAtBottom] = useState(true)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false)
  const [lastSeenMessageCount, setLastSeenMessageCount] = useState(0)
  
  // Get roster players (for display)
  const rosterPlayerIds = Object.keys(myTeam)
  const hasRoster = rosterPlayerIds.length > 0

  // Auto-scroll to bottom function with smooth behavior
  const scrollToBottom = (smooth = true) => {
    if (scrollPanelRef.current) {
      const scrollElement = scrollPanelRef.current.getElement()
      if (scrollElement) {
        const scrollContent = scrollElement.querySelector('.p-scrollpanel-content')
        if (scrollContent) {
          scrollContent.scrollTo({
            top: scrollContent.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto'
          })
          setIsUserAtBottom(true)
          setShowScrollButton(false)
        }
      }
    }
  }

  // Handle scroll events to detect user position
  const handleScroll = () => {
    if (scrollPanelRef.current) {
      const scrollElement = scrollPanelRef.current.getElement()
      if (scrollElement) {
        const scrollContent = scrollElement.querySelector('.p-scrollpanel-content')
        if (scrollContent) {
          const { scrollTop, scrollHeight, clientHeight } = scrollContent
          const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10 // 10px threshold
          setIsUserAtBottom(isAtBottom)
          setShowScrollButton(!isAtBottom && conversationMessages.length > 0)
        }
      }
    }
  }

  // Auto-scroll when drawer opens
  useEffect(() => {
    if (visible && conversationMessages.length > 0) {
      // Small delay to ensure the drawer is fully rendered
      setTimeout(() => {
        scrollToBottom(false) // No smooth scroll on initial open for better UX
        setHasUnreadMessages(false)
        setLastSeenMessageCount(conversationMessages.length)
      }, 100)
    }
  }, [visible])

  // Auto-scroll when new messages arrive (only if user is at bottom or drawer is visible)
  useEffect(() => {
    if (conversationMessages.length > lastSeenMessageCount) {
      if (visible) {
        if (isUserAtBottom) {
          // User is at bottom, auto-scroll to new message
          setTimeout(() => scrollToBottom(true), 50)
        }
        setLastSeenMessageCount(conversationMessages.length)
        setHasUnreadMessages(false)
      } else {
        // Drawer is closed, mark as having unread messages
        setHasUnreadMessages(true)
      }
    }
  }, [conversationMessages.length, visible, isUserAtBottom, lastSeenMessageCount])

  // Set up scroll listener
  useEffect(() => {
    if (scrollPanelRef.current) {
      const scrollElement = scrollPanelRef.current.getElement()
      if (scrollElement) {
        const scrollContent = scrollElement.querySelector('.p-scrollpanel-content')
        if (scrollContent) {
          scrollContent.addEventListener('scroll', handleScroll)
          return () => scrollContent.removeEventListener('scroll', handleScroll)
        }
      }
    }
  }, [conversationMessages.length])

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

  const getMessageIcon = (type: ConversationMessage['type']) => {
    switch (type) {
      case 'strategy': return 'pi-lightbulb'
      case 'player-taken': return 'pi-user-minus'
      case 'user-turn': return 'pi-user-plus'
      case 'loading': return 'pi-spin pi-spinner'
      default: return 'pi-comment'
    }
  }

  const getMessageTitle = (type: ConversationMessage['type']) => {
    switch (type) {
      case 'strategy': return 'Draft Strategy'
      case 'player-taken': return 'Player Taken Analysis'
      case 'user-turn': return 'Your Turn Analysis'
      case 'loading': return 'Analyzing...'
      default: return 'AI Analysis'
    }
  }

  return (
    <Sidebar
      visible={visible}
      onHide={onHide}
      position="right"
      style={{
        width: '33.333333vw',
        maxWidth: '90vw',
        minWidth: '400px'
      }}
      className="ai-analysis-sidebar"
      header={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <i className="pi pi-chart-line text-xl"></i>
            <span className="font-semibold text-lg">AI Draft Analysis</span>
            {conversationId && (
              <Tag
                value="Connected"
                severity="success"
                className="text-xs"
              />
            )}
            {hasUnreadMessages && !visible && (
              <Tag
                value="New"
                severity="info"
                className="text-xs animate-pulse"
                style={{ backgroundColor: '#3b82f6' }}
              />
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 h-full">
        {/* Roster Section - Only show if user has drafted players */}
        {hasRoster && (
          <Card
            title="My Current Roster"
            className="mb-4"
            style={{ backgroundColor: '#f8f9fa' }}
          >
            <div className="flex flex-wrap gap-2">
              {rosterPlayerIds.map((playerId) => (
                <Tag
                  key={playerId}
                  value={`Player ${playerId.slice(0, 8)}...`}
                  severity="info"
                  className="mb-1"
                />
              ))}
            </div>
            <div className="text-sm text-gray-600 mt-2">
              {rosterPlayerIds.length} player{rosterPlayerIds.length !== 1 ? 's' : ''} drafted
            </div>
          </Card>
        )}

        {/* AI Conversation Content */}
        <div className="flex-1">
          <Card
            title={`AI Conversation ${conversationMessages.length > 0 ? `(${conversationMessages.length})` : ''}`}
            className="h-full"
          >
            {/* AI Answer Display - only show if no completed strategy message exists */}
            {aiAnswer.trim().length > 0 && !conversationMessages.some(msg => msg.type === 'strategy') ? (
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="text-sm font-medium mb-2 text-blue-800">AI Draft Strategy:</div>
                <div className="overflow-auto max-h-[calc(100vh-12rem)]">
                  <MarkdownRenderer
                    content={aiAnswer}
                    className="prose max-w-none text-sm text-gray-700 leading-relaxed"
                  />
                </div>
              </div>
            ) : !draftInitialized ? (
              <div className="text-center text-gray-500 py-8">
                <i className="pi pi-robot text-4xl mb-4 block"></i>
                <h3 className="text-lg font-semibold mb-2">Start Your AI-Powered Draft</h3>
                <p className="text-sm mb-4">
                  The AI assistant will generate your draft strategy here…
                </p>
                
                <div className="mt-4 p-4 bg-blue-50 rounded-lg text-left">
                  <p className="text-sm text-blue-700">
                    <strong>Next Steps:</strong>
                    <br />
                    1. Configure your draft settings (teams & pick position)
                    <br />
                    2. Initialize your draft to get AI strategy
                    <br />
                    3. Start marking players as "Taken" or "Drafted"
                    <br />
                    4. Get real-time AI analysis and recommendations
                  </p>
                </div>
              </div>
            ) : null}

            {/* Loading State */}
            {(draftInitialized && conversationMessages.length === 0) || isApiLoading && (
              <div className="text-center text-gray-500 py-8">
                <ProgressSpinner style={{ width: '50px', height: '50px' }} strokeWidth="4" />
                <h3 className="text-lg font-semibold mb-2 mt-4">
                  {isApiLoading ? 'Processing...' : 'Loading AI Analysis'}
                </h3>
                <p className="text-sm">
                  {isApiLoading ? 'AI is analyzing the draft situation...' : 'Generating your personalized draft strategy...'}
                </p>
              </div>
            )}

            {/* Conversation Messages */}
            {conversationMessages.length > 0 && (
              <div className="h-full flex flex-col relative">
                <ScrollPanel
                  ref={scrollPanelRef}
                  style={{ width: '100%', height: '100%' }}
                  className="pr-4"
                >
                  <div className="space-y-4">
                    {conversationMessages.map((message) => (
                      <div key={message.id} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <i className={`pi ${getMessageIcon(message.type)} text-blue-600`}></i>
                            <span className="font-semibold text-gray-800">
                              {getMessageTitle(message.type)}
                            </span>
                            {message.player && (
                              <Tag 
                                value={message.player.name} 
                                severity="info" 
                                className="text-xs"
                              />
                            )}
                          </div>
                          <span className="text-xs text-gray-500">
                            {formatTimestamp(message.timestamp)}
                          </span>
                        </div>
                        
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
                      </div>
                    ))}
                  </div>
                </ScrollPanel>
                
                {/* Scroll to Latest Button */}
                {showScrollButton && (
                  <div className="absolute bottom-16 right-4 z-10">
                    <Button
                      icon="pi pi-arrow-down"
                      className="p-button-rounded p-button-info p-button-sm shadow-lg"
                      tooltip="Scroll to latest message"
                      tooltipOptions={{ position: 'left' }}
                      onClick={() => scrollToBottom(true)}
                      style={{
                        backgroundColor: '#3b82f6',
                        borderColor: '#3b82f6',
                        animation: 'pulse 2s infinite'
                      }}
                    />
                  </div>
                )}
                
                {/* Conversation Footer */}
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <i className="pi pi-info-circle"></i>
                      <span>
                        AI analysis updates automatically as the draft progresses
                      </span>
                    </div>
                    {conversationMessages.length > 3 && (
                      <Button
                        icon="pi pi-arrow-down"
                        label="Latest"
                        className="p-button-text p-button-sm text-xs"
                        onClick={() => scrollToBottom(true)}
                        style={{ color: '#6b7280' }}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Draft Progress Indicator */}
            {draftInitialized && (
              <div className="mt-4 p-3 bg-green-50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-green-700 font-medium">
                    Draft Status: {getTotalDraftedCount() === 0 ? 'Ready to Start' : 'In Progress'}
                  </span>
                  <span className="text-green-600">
                    {getTotalDraftedCount()} picks made
                  </span>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </Sidebar>
  )
}