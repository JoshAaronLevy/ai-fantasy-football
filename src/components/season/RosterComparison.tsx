import React, { useEffect } from 'react'
import { Button } from 'primereact/button'
import { useSeasonStore } from '../../state'
import { RosterTable } from './RosterTable'
import { useRosterAnalysisStream } from '../../hooks/useRosterAnalysisStream'
import { getUserId } from '../../lib/storage/localStore'

export const RosterComparison: React.FC = () => {
  const selectedOpponentTeam = useSeasonStore(s => s.selectedOpponentTeam)
  const rostersLoading = useSeasonStore(s => s.rostersLoading)
  const rostersError = useSeasonStore(s => s.rostersError)
  const teamsLoading = useSeasonStore(s => s.teamsLoading)
  const teamsError = useSeasonStore(s => s.teamsError)
  const userRoster = useSeasonStore(s => s.userRoster)
  const selectedWeek = useSeasonStore(s => s.selectedWeek)
  const getRosterFromCache = useSeasonStore(s => s.getRosterFromCache)
  const fetchRosterComparison = useSeasonStore(s => s.fetchRosterComparison)
  const fetchUserRoster = useSeasonStore(s => s.fetchUserRoster)
  
  // Streaming hook for roster analysis
  const { start: startRosterAnalysis, cancel: cancelRosterAnalysis, isStreaming } = useRosterAnalysisStream()
  
  // Get opponent roster from cache
  const opponentRoster = selectedOpponentTeam ? getRosterFromCache(selectedOpponentTeam.id) : null

  // Handle analyze roster button click
  const handleAnalyzeRoster = async () => {
    if (!userRoster || userRoster.length === 0) {
      console.warn('No user roster available for analysis')
      return
    }

    const userId = getUserId()
    
    // Create payload with streaming mode
    const payload = {
      response_mode: 'streaming',
      user: String(userId),
      query: 'Analyze rosters for weekly projections.',
      inputs: {
        userRoster: userRoster,
        opponentRoster: [],
        week: selectedWeek
      }
    }

    console.log('Starting roster analysis stream for week:', selectedWeek)
    
    await startRosterAnalysis(payload, {
      onStart: () => console.log("Roster analysis stream started"),
      onError: (err) => console.error("Roster analyze stream error:", err),
      onMessageEnd: (fullContent) => console.log("Roster analyze stream complete:", fullContent)
    })
  }
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelRosterAnalysis()
    }
  }, [cancelRosterAnalysis])
  
  // Fetch user roster (Boykies)
  useEffect(() => {
    fetchUserRoster().catch(error => {
      console.warn('Failed to fetch user roster:', error);
    });
  }, [fetchUserRoster]);

  // Then try to enrich with schedule data for Boykies
  useEffect(() => {
    fetchRosterComparison('boykies').catch(error => {
      console.warn('Failed to enrich Boykies roster, will use base data:', error);
    });
  }, [fetchRosterComparison]);

  // Fetch opponent roster when selected opponent changes
  useEffect(() => {
    if (selectedOpponentTeam) {
      fetchRosterComparison(selectedOpponentTeam.id).catch(error => {
        console.warn(`Failed to enrich opponent roster, will use base data:`, error);
      });
    }
  }, [selectedOpponentTeam, fetchRosterComparison]);

  // Show loading if either rosters or teams are loading
  if (rostersLoading || teamsLoading) {
    return (
      <div className="roster-comparison-loading">
        <div className="flex justify-center items-center py-8">
          <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem' }}></i>
          <span className="ml-2 text-lg">Loading rosters...</span>
        </div>
      </div>
    )
  }

  // Show error only if we have no data at all
  if (rostersError || teamsError) {
    return (
      <div className="roster-comparison-error">
        <div className="text-center py-8">
          <i className="pi pi-exclamation-triangle" style={{ fontSize: '2rem', color: '#f59e0b' }}></i>
          <h3 className="text-lg font-semibold mt-2 mb-1">Error Loading Rosters</h3>
          <p className="text-gray-600">{rostersError || teamsError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="roster-comparison">
      <div className="roster-comparison-grid">
        {/* Boykies Roster */}
        <div className="roster-table-wrapper">
          <div style={{ marginBottom: '1rem' }}>
            <Button
              label="Analyze Roster"
              onClick={handleAnalyzeRoster}
              loading={isStreaming}
              disabled={!userRoster || userRoster.length === 0}
              icon="pi pi-chart-line"
            />
          </div>
          <RosterTable
            userRoster={userRoster || []}
            teamName="Boykies"
          />
        </div>

        {/* Opponent Roster */}
        <div className="roster-table-wrapper">
          <RosterTable
            userRoster={opponentRoster || []}
            teamName={selectedOpponentTeam?.name || 'Select Opponent'}
          />
        </div>
      </div>
    </div>
  )
}