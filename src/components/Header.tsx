import React from 'react'
import { Toolbar } from 'primereact/toolbar'
import { Button } from 'primereact/button'
import { Tag } from 'primereact/tag'
import { useDraftStore } from '../state/draftStore'

interface HeaderProps {
  onViewAIAnalysis?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onViewAIAnalysis }) => {
  const { isOfflineMode, isAnalysisLoading } = useDraftStore()
  const startContent = (
    <div className="flex items-center gap-3">
      <div>
        <span style={{ fontSize: '1.75rem' }}>🏈</span>
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
        label={isAnalysisLoading ? "Performing Analysis" : "AI Assistant"}
        icon={isAnalysisLoading ? "pi pi-spin pi-spinner" : "pi pi-chart-line"}
        onClick={onViewAIAnalysis}
        disabled={isAnalysisLoading}
        size="large"
        style={{
          backgroundColor: isAnalysisLoading ? 'rgba(255, 255, 255, 0.1)' : '#FFB612',
          backdropFilter: 'blur(8px)',
          border: '#002244',
          color: '#002244',
          fontWeight: '600',
          padding: '0.75rem 1.5rem',
          fontSize: '1rem',
          opacity: isAnalysisLoading ? 0.8 : 1
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
