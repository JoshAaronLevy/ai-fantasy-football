/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useRef } from 'react'
import { Sidebar } from 'primereact/sidebar'
import { Card } from 'primereact/card'
import { Tag } from 'primereact/tag'
import { Button } from 'primereact/button'
import { ProgressSpinner } from 'primereact/progressspinner'
import { Message } from 'primereact/message'
import { useDraftStore } from '../state/draftStore'
import { MarkdownRenderer } from './common/MarkdownRenderer'
import { queryBlocking } from '../lib/api'
import { toSlimPlayer } from '../lib/players/slim'
import { ConversationHistory, type ConversationHistoryRef } from './ai/ConversationHistory'
import { QueryInput } from './ai/QueryInput'
import { useStreamingScroll } from '../hooks/useStreamingScroll'

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
  // Zustand selectors
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
  // AI Assistant streaming state and actions
  const assistantStreaming = useDraftStore((s) => s.assistantStreaming)
  
  // User query state
  const [queryEntries, setQueryEntries] = useState<QueryEntry[]>([])
  
  // Create a ref for ConversationHistory
  const conversationHistoryRef = useRef<ConversationHistoryRef>(null)
  
  // Use streaming scroll hook to replace scroll management
  const {
    onUserScroll,
    showScrollButton,
    hasUnreadMessages,
    scrollToBottom
  } = useStreamingScroll({
    messageCount: conversationMessages.length,
    isVisible: visible,
    streamingContentLength: assistantStreaming.content.length
  })
  
  // Get roster players (for display)
  const rosterPlayerIds = Object.keys(myTeam)
  const hasRoster = rosterPlayerIds.length > 0

  // Send user query handler - preserve exact behavior
  const handleSendQuery = async (userMessage: string) => {
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
      
      // Update conversationId if returned
      if (newConversationId) {
        // This would normally update the store but we'll keep it simple for now
      }
      
      // Scroll to bottom after adding new entry
      setTimeout(() => scrollToBottom(), 100)
      
    } catch (error) {
      console.error('Query failed:', error)
      // Could show toast error here
    }
  }

  // Prepare combined messages for ConversationHistory
  const messageItems = conversationMessages.map((message) => ({
    ...message,
    role: 'assistant' as const,
    ts: message.timestamp
  }))
  
  const queryItems = queryEntries.map((entry) => ({
    id: entry.id,
    role: 'assistant' as const,
    content: entry.ai,
    ts: entry.createdAt,
    type: 'query' as const,
    round: entry.round,
    messageNumber: entry.messageNumber,
    user: entry.user,
    ai: entry.ai
  }))
  
  // Combine and sort by timestamp
  const allMessages = [...messageItems, ...queryItems].sort((a, b) => {
    const aTime = a.ts || Date.now()
    const bTime = b.ts || Date.now()
    return aTime - bTime
  })


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

            {/* Conversation Messages */}
            {allMessages.length > 0 && (
              <div className="h-full flex flex-col relative">
                <ConversationHistory
                  messages={allMessages}
                  onScroll={onUserScroll}
                  ref={conversationHistoryRef}
                />
                
                {/* Scroll to Latest Button */}
                {showScrollButton && (
                  <div className="absolute bottom-16 right-4 z-10">
                    <Button
                      icon="pi pi-arrow-down"
                      className="p-button-rounded p-button-info p-button-sm shadow-lg"
                      tooltip="Scroll to latest message"
                      tooltipOptions={{ position: 'left' }}
                      onClick={() => scrollToBottom()}
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
                        onClick={() => scrollToBottom()}
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
          <QueryInput
            disabled={isApiLoading}
            onSubmit={handleSendQuery}
          />
        )}
      </div>
    </Sidebar>
  )
}