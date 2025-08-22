import React from 'react'
import { Toolbar } from 'primereact/toolbar'

export const Header: React.FC = () => {
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

  return (
    <header className="custom-header">
      <div style={{
        margin: '0 auto',
        maxWidth: '95vw',
        padding: '1rem'
      }}>
        <Toolbar
          start={startContent}
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
