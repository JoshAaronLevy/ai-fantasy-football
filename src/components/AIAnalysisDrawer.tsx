import React, { useCallback, useEffect } from 'react'
import { Sidebar } from 'primereact/sidebar'
import { Button } from 'primereact/button'
import { Card } from 'primereact/card'
import { Tag } from 'primereact/tag'
import { ScrollPanel } from 'primereact/scrollpanel'
import { ProgressSpinner } from 'primereact/progressspinner'
import { Message } from 'primereact/message'
import { useDraftStore } from '../state/draftStore'
import { useLlmStream } from '../hooks/useLlmStream'
import type { ConversationMessage, Player } from '../types'

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
  const draftConfig = useDraftStore((s) => s.draftConfig)
  const streamingState = useDraftStore((s) => s.streamingState)
  const players = useDraftStore((s) => s.players)
  const getCurrentRound = useDraftStore((s) => s.getCurrentRound)
  const getCurrentPick = useDraftStore((s) => s.getCurrentPick)
  
  // Store actions
  const startStreaming = useDraftStore((s) => s.startStreaming)
  const updateStreamingMessage = useDraftStore((s) => s.updateStreamingMessage)
  const completeStreaming = useDraftStore((s) => s.completeStreaming)
  const errorStreaming = useDraftStore((s) => s.errorStreaming)
  const stopStreaming = useDraftStore((s) => s.stopStreaming)
  const createStreamingMessage = useDraftStore((s) => s.createStreamingMessage)
  
  // Streaming hook
  const [streamState, { start: startStream, abort: abortStream }] = useLlmStream()
  
  // Get roster players (for display)
  const rosterPlayerIds = Object.keys(myTeam)
  const hasRoster = rosterPlayerIds.length > 0

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
      case 'streaming': return 'pi-play'
      default: return 'pi-comment'
    }
  }

  const getMessageTitle = (type: ConversationMessage['type']) => {
    switch (type) {
      case 'strategy': return 'Draft Strategy'
      case 'player-taken': return 'Player Taken Analysis'
      case 'user-turn': return 'Your Turn Analysis'
      case 'loading': return 'Analyzing...'
      case 'streaming': return 'AI Analysis (Streaming)'
      default: return 'AI Analysis'
    }
  }

  // Handle streaming integration with store
  useEffect(() => {
    if (streamState.isStreaming && streamingState.currentMessageId) {
      updateStreamingMessage(streamingState.currentMessageId, streamState.tokens)
    }
  }, [streamState.tokens, streamState.isStreaming, streamingState.currentMessageId, updateStreamingMessage])

  useEffect(() => {
    if (streamState.error && streamingState.currentMessageId) {
      errorStreaming(streamingState.currentMessageId, streamState.error)
    }
  }, [streamState.error, streamingState.currentMessageId, errorStreaming])

  useEffect(() => {
    if (!streamState.isStreaming && streamState.tokens && streamingState.currentMessageId && streamingState.isActive) {
      completeStreaming(streamingState.currentMessageId, streamState.tokens)
    }
  }, [streamState.isStreaming, streamState.tokens, streamingState.currentMessageId, streamingState.isActive, completeStreaming])

  // Streaming functions
  const handleAnalyzePlayer = useCallback(async (player: Player, action: 'user-turn' | 'player-taken' = 'user-turn') => {
    if (!conversationId || !draftConfig.teams || !draftConfig.pick) {
      console.error('Missing required configuration for AI analysis')
      return
    }

    try {
      // Create a new streaming message
      const messageId = createStreamingMessage(
        action,
        player,
        action === 'user-turn' ? getCurrentRound() : undefined,
        action === 'user-turn' ? getCurrentPick() : undefined
      )

      // Start streaming state in store
      startStreaming(messageId, 'fetch')

      // Start the LLM stream
      await startStream({
        action,
        conversationId,
        payload: {
          player,
          round: getCurrentRound(),
          pick: getCurrentPick(),
          userRoster: myTeam,
          availablePlayers: players.filter(p => !useDraftStore.getState().isDrafted(p.id) && !useDraftStore.getState().isTaken(p.id)),
          draftConfig: {
            teams: draftConfig.teams,
            pick: draftConfig.pick
          }
        }
      })
    } catch (error) {
      console.error('Failed to start streaming analysis:', error)
    }
  }, [conversationId, draftConfig, myTeam, players, getCurrentRound, getCurrentPick, createStreamingMessage, startStreaming, startStream])

  const handleStopStreaming = useCallback(() => {
    abortStream()
    stopStreaming()
  }, [abortStream, stopStreaming])

  const handleRetryStreaming = useCallback(async () => {
    // Find the last failed message
    const lastMessage = conversationMessages[conversationMessages.length - 1]
    if (lastMessage?.streamingError && lastMessage.player) {
      await handleAnalyzePlayer(lastMessage.player, lastMessage.type as 'user-turn' | 'player-taken')
    }
  }, [conversationMessages, handleAnalyzePlayer])

  // Calculate streaming stats
  const getStreamingStats = () => {
    if (!streamingState.isActive || !streamingState.startTime) return null
    
    const elapsed = Date.now() - streamingState.startTime
    const tokensPerSecond = streamingState.tokenCount ? Math.round((streamingState.tokenCount / elapsed) * 1000) : 0
    
    return {
      elapsed: Math.round(elapsed / 1000),
      tokensPerSecond,
      tokenCount: streamingState.tokenCount || 0
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
            {streamingState.isActive && (
              <Tag 
                value={`Streaming (${streamingState.transportMode?.toUpperCase()})`}
                severity="info" 
                className="text-xs animate-pulse" 
              />
            )}
          </div>
          <Button
            icon="pi pi-times"
            onClick={onHide}
            text
            rounded
            severity="secondary"
            size="small"
            style={{ color: 'white' }}
          />
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
            {/* Empty State */}
            {!draftInitialized && (
              <div className="text-center text-gray-500 py-8">
                <i className="pi pi-robot text-4xl mb-4 block"></i>
                <h3 className="text-lg font-semibold mb-2">Start Your AI-Powered Draft</h3>
                <p className="text-sm mb-4">
                  Configure your draft settings to get personalized AI strategy and recommendations.
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
            )}

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

            {/* Streaming Controls */}
            {streamingState.isActive && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ProgressSpinner style={{ width: '20px', height: '20px' }} strokeWidth="4" />
                    <span className="text-sm font-medium text-blue-700">
                      AI is streaming analysis...
                    </span>
                  </div>
                  <Button
                    icon="pi pi-stop"
                    onClick={handleStopStreaming}
                    size="small"
                    severity="danger"
                    outlined
                    className="h-8"
                    tooltip="Stop streaming"
                  />
                </div>
                
                {streamState.lastEvent?.type === 'phase' && (
                  <div className="text-gray-500 text-xs mb-2">Phase: {streamState.lastEvent.step} {streamState.lastEvent.status ? `(status ${streamState.lastEvent.status})` : ''}</div>
                )}
                
                {(() => {
                  const stats = getStreamingStats()
                  return stats && (
                    <div className="flex items-center gap-4 text-xs text-blue-600">
                      <span>⏱️ {stats.elapsed}s</span>
                      <span>📊 {stats.tokenCount} tokens</span>
                      <span>⚡ {stats.tokensPerSecond}/s</span>
                      <span className="capitalize">🔄 {streamingState.transportMode}</span>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Stream Error Display */}
            {streamState.error && (
              <div className="mb-4">
                <Message 
                  severity="error" 
                  text={streamState.error}
                  className="w-full"
                />
                <div className="mt-2 flex gap-2">
                  <Button
                    label="Retry"
                    icon="pi pi-refresh"
                    onClick={handleRetryStreaming}
                    size="small"
                    outlined
                  />
                  <Button
                    label="Dismiss"
                    icon="pi pi-times"
                    onClick={() => stopStreaming()}
                    size="small"
                    text
                  />
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {conversationMessages.length > 0 && (
              <div className="h-full flex flex-col">
                <ScrollPanel style={{ width: '100%', height: '100%' }} className="pr-4">
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
                        ) : message.isStreaming ? (
                          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                            {message.content}
                            <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1"></span>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                            {message.content}
                          </div>
                        )}

                        {/* Stream Error for individual messages */}
                        {message.streamingError && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                            <i className="pi pi-exclamation-triangle mr-1"></i>
                            Streaming failed: {message.streamingError}
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
                
                {/* Conversation Footer */}
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <i className="pi pi-info-circle"></i>
                      <span>
                        AI analysis updates automatically as the draft progresses
                      </span>
                    </div>
                    
                    {/* Quick Action Buttons */}
                    <div className="flex gap-2">
                      <Button
                        label="Test Stream"
                        icon="pi pi-play"
                        onClick={() => {
                          const testPlayer = players[0]
                          if (testPlayer) handleAnalyzePlayer(testPlayer, 'user-turn')
                        }}
                        size="small"
                        outlined
                        disabled={streamingState.isActive || !players.length}
                        className="text-xs"
                      />
                    </div>
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