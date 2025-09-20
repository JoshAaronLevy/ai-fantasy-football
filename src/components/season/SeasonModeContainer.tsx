import React, { useEffect, useRef } from 'react'
import { Toast } from 'primereact/toast'
import { useSeasonStore } from '../../state'
import { RosterComparison } from './RosterComparison'
import { TeamSelector } from './TeamSelector'
import { WeekSelector } from './WeekSelector'

interface SeasonModeContainerProps {
  toast: React.RefObject<Toast | null>;
}

export const SeasonModeContainer: React.FC<SeasonModeContainerProps> = ({ toast }) => {
  const teamsLoading = useSeasonStore(s => s.teamsLoading)
  const teamsError = useSeasonStore(s => s.teamsError)
  const availableTeams = useSeasonStore(s => s.availableTeams)
  const initializeSeasonMode = useSeasonStore(s => s.initializeSeasonMode) // stable selector
  const didInitRef = useRef(false)

  // Initialize Season Mode on mount
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true

    if (availableTeams.length === 0 && !teamsLoading && !teamsError) {
      initializeSeasonMode().catch((error) => {
        console.error('Failed to initialize Season Mode:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Season Mode Error',
          detail: 'Failed to initialize Season Mode. Please try again.',
          life: 5000
        })
      })
    }
  }, [availableTeams.length, teamsLoading, teamsError, initializeSeasonMode])

  // Show error toast when teams fail to load
  useEffect(() => {
    if (teamsError) {
      toast.current?.show({
        severity: 'error',
        summary: 'Unable to load teams',
        detail: teamsError,
        life: 5000
      })
    }
  }, [teamsError, toast])

  if (teamsLoading) {
    return (
      <div className="season-container">
        <div className="flex justify-center items-center py-8">
          <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem' }}></i>
          <span className="ml-2 text-lg">Loading Season Mode...</span>
        </div>
      </div>
    )
  }

  if (teamsError) {
    return (
      <div className="season-container">
        <div className="text-center py-8">
          <i className="pi pi-exclamation-triangle" style={{ fontSize: '3rem', color: '#f59e0b' }}></i>
          <h2 className="text-xl font-semibold mt-4 mb-2">Season Mode Unavailable</h2>
          <p className="text-gray-600">{teamsError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="season-container">
      <div className="season-header mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-gray-800">
            Season Mode - Roster Comparison
          </h2>
          <div className="flex items-center gap-4">
            <WeekSelector />
            <TeamSelector />
          </div>
        </div>
      </div>
      
      <RosterComparison />
    </div>
  )
}