/* eslint-disable react-hooks/exhaustive-deps */
import React, { useRef, useState, useEffect, useCallback } from 'react'
import { Sidebar } from 'primereact/sidebar'
import { Card } from 'primereact/card'
import { Tag } from 'primereact/tag'
import { ScrollPanel } from 'primereact/scrollpanel'
import { Button } from 'primereact/button'
import { ProgressSpinner } from 'primereact/progressspinner'
import { Message } from 'primereact/message'
import { Accordion, AccordionTab } from 'primereact/accordion'
import { InputTextarea } from 'primereact/inputtextarea'
import { useDraftStore } from '../state/draftStore'
import { MarkdownRenderer } from './common/MarkdownRenderer'
import { queryBlocking } from '../lib/api'
import { toSlimPlayer } from '../lib/players/slim'
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

interface QueryEntry {
  id: string;
  round: number;
  messageNumber: number;
  user: string;
  ai: string;
  createdAt: number;
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
  const isOfflineMode = useDraftStore((s) => s.isOfflineMode)
  const players = useDraftStore((s) => s.players)
  const drafted = useDraftStore((s) => s.drafted)
  const taken = useDraftStore((s) => s.taken)
  const draftConfig = useDraftStore((s) => s.draftConfig)
  const getCurrentRound = useDraftStore((s) => s.getCurrentRound)
  const getCurrentPick = useDraftStore((s) => s.getCurrentPick)
  const selectedPlayers = useDraftStore((s) => s.selectedPlayers)
  
  // Scroll management state and refs
  const scrollPanelRef = useRef<ScrollPanel>(null)
  const [isUserAtBottom, setIsUserAtBottom] = useState(true)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false)
  const [lastSeenMessageCount, setLastSeenMessageCount] = useState(0)
  
  // User query state
  const [userMessage, setUserMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [queryEntries, setQueryEntries] = useState<QueryEntry[]>([])
  
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
  const handleScroll = useCallback(() => {
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
  }, [conversationMessages.length])

  // Auto-scroll when drawer opens
  useEffect(() => {
    if (visible && conversationMessages.length > 0) {
      // Small delay to ensure the drawer is fully rendered
      setTimeout(() => {
        // Use smooth scrolling if there are unread messages, otherwise instant
        const shouldSmoothScroll = hasUnreadMessages
        scrollToBottom(shouldSmoothScroll)
        setHasUnreadMessages(false)
        setLastSeenMessageCount(conversationMessages.length)
      }, 100)
    }
  }, [visible, hasUnreadMessages])

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

  // Send user query handler
  const handleSendQuery = async () => {
    if (!userMessage.trim() || isSending) return
    
    setIsSending(true)
    try {
      // Get current draft state
      const currentRound = getCurrentRound()
      const currentPick = getCurrentPick()
      
      // Get roster players (drafted by user)
      const rosterPlayers = players.filter(p => drafted[p.id])
      
      // Determine which players to analyze based on selection state
      // If no players are selected (or less than 2), use top 25 available players
      // If players are selected (2 or more), use only those selected players
      let playersToAnalyze: typeof players
      if (selectedPlayers.length >= 2) {
        playersToAnalyze = selectedPlayers
      } else {
        // Get top 25 available players (not drafted and not taken)
        const allAvailable = players.filter(p => !drafted[p.id] && !taken[p.id])
        playersToAnalyze = allAvailable.slice(0, 25)
      }
      
      // Filter the players to analyze to only include available ones
      const availablePlayers = playersToAnalyze.filter(p => !drafted[p.id] && !taken[p.id])
      
      // Convert to SlimPlayer format
      const rosterSlim = rosterPlayers.map(toSlimPlayer)
      const availableSlim = availablePlayers.map(toSlimPlayer)
      
      // Call queryBlocking with same payload structure as analyze
      const { text, conversationId: newConversationId } = await queryBlocking({
        conversationId,
        round: currentRound || 1,
        pick: currentPick || 1,
        roster: rosterSlim,
        availablePlayers: availableSlim,
        leagueSize: draftConfig.teams || 12,
        pickSlot: draftConfig.pick || 1,
        userMessage: userMessage.trim()
      })
      
      // Calculate message number for this round
      const round = currentRound || 1
      const existingEntriesInRound = queryEntries.filter(entry => entry.round === round)
      const messageNumber = existingEntriesInRound.length + 1
      
      // Create new query entry
      const newEntry: QueryEntry = {
        id: Date.now().toString(),
        round,
        messageNumber,
        user: userMessage.trim(),
        ai: text,
        createdAt: Date.now()
      }
      
      // Update query entries
      setQueryEntries(prev => [...prev, newEntry])
      
      // Clear the input
      setUserMessage('')
      
      // Update conversationId if returned
      if (newConversationId) {
        // This would normally update the store but we'll keep it simple for now
      }
      
      // Scroll to bottom after adding new entry
      setTimeout(() => scrollToBottom(true), 100)
      
    } catch (error) {
      console.error('Query failed:', error)
      // Could show toast error here
    } finally {
      setIsSending(false)
    }
  }

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

  // Generate accordion title for message
  const getAccordionTitle = (message: ConversationMessage) => {
    if (message.type === 'strategy') {
      return 'Draft Strategy'
    }
    
    if (message.type === 'analysis' && message.meta) {
      const playerCount = message.meta.playerCount || 'Unknown'
      return `Round ${message.meta.round} - ${playerCount} Players`
    }
    
    // Fallback for other message types
    return getMessageTitle(message.type)
  }

  // Prepare accordion items from messages and query entries
  const messageItems = conversationMessages.map((message) => ({
    type: 'message' as const,
    message,
    title: getAccordionTitle(message)
  }))
  
  const queryItems = queryEntries.map((entry) => ({
    type: 'query' as const,
    entry,
    title: `Round ${entry.round}: User Query (${entry.messageNumber})`
  }))
  
  // Combine and sort by timestamp
  const allItems = [...messageItems, ...queryItems].sort((a, b) => {
    const aTime = a.type === 'message' ? a.message.timestamp : a.entry.createdAt
    const bTime = b.type === 'message' ? b.message.timestamp : b.entry.createdAt
    return aTime - bTime
  })

  // Default to only the last accordion item being expanded
  const defaultActiveIndex = allItems.length > 0 ? [allItems.length - 1] : []

  return (
    <Sidebar
      visible={visible}
      onHide={onHide}
      position="right"
      style={{
        width: '50vw',
        maxWidth: '90vw',
        minWidth: '25vw'
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
        {/* Offline Message - Show when in offline mode */}
        {isOfflineMode && (
          <Message
            severity="info"
            text="Live analysis paused while offline."
            className="mb-4"
            style={{
              backgroundColor: '#e3f2fd',
              borderColor: '#2196f3',
              color: '#1565c0'
            }}
          />
        )}

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

            {/* Conversation Messages in Accordion */}
            {conversationMessages.length > 0 && (
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
                    {allItems.map((item) => (
                      <AccordionTab
                        key={item.type === 'message' ? item.message.id : item.entry.id}
                        header={
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                              <i className={`pi ${item.type === 'message' ? getMessageIcon(item.message.type) : 'pi-comment'} text-blue-600`}></i>
                              <span className="font-semibold text-gray-800">{item.title}</span>
                              {item.type === 'message' && item.message.player && (
                                <Tag
                                  value={item.message.player.name}
                                  severity="info"
                                  className="text-xs"
                                />
                              )}
                            </div>
                            <span className="text-xs text-gray-500 ml-2">
                              {formatTimestamp(item.type === 'message' ? item.message.timestamp : item.entry.createdAt)}
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
                          {item.type === 'message' ? (
                            <>
                              {item.message.type === 'loading' ? (
                                <div className="flex items-center gap-2">
                                  <ProgressSpinner style={{ width: '20px', height: '20px' }} strokeWidth="4" />
                                  <span className="text-sm text-gray-600">Analyzing draft situation...</span>
                                </div>
                              ) : (
                                <div className="text-sm text-gray-700 leading-relaxed">
                                  {isAckMessage(item.message.content) ? (
                                    <div className={getAckChipStyles(item.message.content)}>
                                      {item.message.content.trim()}
                                    </div>
                                  ) : (
                                    <MarkdownRenderer
                                      content={item.message.content}
                                      className="prose max-w-none text-sm"
                                    />
                                  )}
                                </div>
                              )}
                              
                              {item.message.round && item.message.pick && (
                                <div className="mt-3 pt-2 border-t border-gray-200">
                                  <span className="text-xs text-gray-500">
                                    Round {item.message.round}, Pick {item.message.pick}
                                  </span>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="space-y-4">
                              <div>
                                <div className="text-sm font-medium text-gray-800 mb-2">User:</div>
                                <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                                  {item.entry.user}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm font-medium text-blue-800 mb-2">AI Assistant:</div>
                                <div className="text-sm text-gray-700">
                                  <MarkdownRenderer
                                    content={item.entry.ai}
                                    className="prose max-w-none text-sm"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </AccordionTab>
                    ))}
                  </Accordion>
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
        
        {/* User Query Input - Fixed at bottom */}
        {draftInitialized && (
          <div className="mt-4 p-4 bg-white border-t border-gray-200">
            <div className="flex gap-2">
              <InputTextarea
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                placeholder="Ask the AI assistant a question about your draft..."
                rows={2}
                autoResize
                className="flex-1"
                disabled={isSending}
              />
              <Button
                icon={isSending ? "pi pi-spin pi-spinner" : "pi pi-send"}
                label="Send"
                onClick={handleSendQuery}
                disabled={isSending || !userMessage.trim()}
                className="p-button-primary"
                style={{ minWidth: '80px' }}
              />
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  )
}