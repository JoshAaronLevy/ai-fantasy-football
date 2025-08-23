import React from 'react'
import { Toolbar } from 'primereact/toolbar'
import { Button } from 'primereact/button'

interface HeaderProps {
  onViewAIAnalysis?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onViewAIAnalysis }) => {
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
      <div>
        <h1 style={{
          fontSize: 'clamp(1.25rem, 2.5vw, 1.5rem)',
          fontWeight: '600',
          color: 'white',
          letterSpacing: '-0.025em',
          margin: 0
        }}>
          Boykies Fantasy Football
        </h1>
      </div>
    </div>
  )

  const endContent = (
    <div className="flex items-center">
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
