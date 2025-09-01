import React from 'react'
import { ToggleButton } from 'primereact/togglebutton'
import { useSeasonStore } from '../../state'

interface ModeToggleProps {
  className?: string;
}

export const ModeToggle: React.FC<ModeToggleProps> = ({ className = '' }) => {
  // Read mode from season store for rendering
  const currentMode = useSeasonStore(s => s.currentMode)
  const setSeasonMode = useSeasonStore(s => s.setCurrentMode)
  
  const handleModeChange = (isSeasonMode: boolean) => {
    const mode = isSeasonMode ? 'season' : 'draft'
    setSeasonMode(mode)
  }

  return (
    <ToggleButton
      checked={currentMode === 'season'}
      onChange={(e) => handleModeChange(e.value)}
      onLabel="Season Mode"
      offLabel="Draft Mode"
      onIcon="pi pi-calendar"
      offIcon="pi pi-users"
      className={`mode-toggle ${className}`}
      style={{
        backgroundColor: currentMode === 'season' ? '#FFB612' : 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        color: currentMode === 'season' ? '#002244' : 'white',
        fontWeight: '600',
        fontSize: '0.875rem',
        padding: '0.5rem 1rem'
      }}
    />
  )
}