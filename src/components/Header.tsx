/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react'
import { Toolbar } from 'primereact/toolbar'
import { Button } from 'primereact/button'
import { Tag } from 'primereact/tag'
import { resetBlocking, formatApiError } from '../lib/api'
import { getUserId, clearConversationId, getConversationId } from '../lib/storage/localStore'
import { useDraftStore } from '../state/draftStore'

interface HeaderProps {
  onViewAIAnalysis?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onViewAIAnalysis }) => {
  const [isResetting, setIsResetting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const { clearAiAnswer, clearLocalState, isOfflineMode } = useDraftStore()

  const onReset = async () => {
    setIsResetting(true)
    setError(null)

    try {
      const conversationId = getConversationId('draft');
      const result = await resetBlocking({
        user: getUserId(),
        conversationId: conversationId || undefined
      })
      
      // Check for server error response
      if (result?.error) {
        const errorMessage = formatApiError(result, 'Reset failed')
        setError(errorMessage)
        console.error('Reset failed:', errorMessage)
        return
      }
      
      // Clear localStorage conversation ID and state
      clearConversationId('draft')
      clearAiAnswer()
      clearLocalState()

      // Optionally show success (could use toast if available)
      console.log('Draft reset successfully')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Reset failed'
      setError(errorMessage)
      console.error('Reset failed:', errorMessage)
    } finally {
      setIsResetting(false)
    }
  }
  const startContent = (
    <div className="flex items-center gap-3">
      <div style={{
        padding: '0.5rem',
        borderRadius: '0.75rem',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        backdropFilter: 'blur(8px)'
      }}>
        <span style={{ fontSize: '1.5rem' }}>🏈</span>
      </div>
      <div className="flex items-center gap-2">
        <h1 style={{
          fontSize: 'clamp(1.25rem, 2.5vw, 1.5rem)',
          fontWeight: '600',
          color: 'white',
          letterSpacing: '-0.025em',
          margin: 0
        }}>
          Boykies Fantasy Football
        </h1>
        {isOfflineMode && (
          <Tag
            value="Offline"
            severity="warning"
            className="text-xs"
            style={{
              backgroundColor: 'rgba(255, 193, 7, 0.9)',
              color: '#856404',
              fontWeight: '600'
            }}
          />
        )}
      </div>
    </div>
  )

  const endContent = (
    <div className="flex items-center gap-3">
      <Button
        label="View AI Analysis"
        icon="pi pi-chart-line"
        onClick={onViewAIAnalysis}
        size="large"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          color: 'white',
          fontWeight: '600',
          padding: '0.75rem 1.5rem',
          fontSize: '1rem'
        }}
        className="hover-bg-white-20 transition-colors"
      />
    </div>
  )

  return (
    <header className="custom-header">
      <div style={{
        margin: '0 auto',
        maxWidth: '95vw',
        padding: '1rem'
      }}>
        <Toolbar
          start={startContent}
          end={endContent}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0
          }}
        />
      </div>
    </header>
  )
}
