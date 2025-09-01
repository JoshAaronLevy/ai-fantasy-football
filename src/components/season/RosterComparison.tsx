import React, { useEffect } from 'react'
import { useSeasonStore } from '../../state'
import { RosterTable } from './RosterTable'
import { fetchAllRosters } from '../../lib/api'
import type { AllPlayersApiResponse } from '../../types'
import { useShapedLineup } from '../../season/hooks/useShapedLineup'

export const RosterComparison: React.FC = () => {
  const selectedOpponentTeam = useSeasonStore(s => s.selectedOpponentTeam)
  const rostersLoading = useSeasonStore(s => s.rostersLoading)
  const rostersError = useSeasonStore(s => s.rostersError)
  const setAllPlayersData = useSeasonStore(s => s.setAllPlayersData)
  const setMyRoster = useSeasonStore(s => s.setMyRoster)
  const setOpponentRosterData = useSeasonStore(s => s.setOpponentRosterData)
  const extractMyRoster = useSeasonStore(s => s.extractMyRoster)
  const extractOpponentRoster = useSeasonStore(s => s.extractOpponentRoster)
  const saveAllPlayersDataToStorage = useSeasonStore(s => s.saveAllPlayersDataToStorage)
  const saveOpponentRosterToStorage = useSeasonStore(s => s.saveOpponentRosterToStorage)
  const loadRosterDataFromStorage = useSeasonStore(s => s.loadRosterDataFromStorage)
  
  // Use the shaped lineup hook for both teams
  const boykiesLineup = useShapedLineup('Boykies')
  const opponentLineup = useShapedLineup(selectedOpponentTeam?.name || null)


  // Load data from storage and automatically call API when component mounts
  useEffect(() => {
    // Load roster data from storage first
    loadRosterDataFromStorage()
    
    const fetchOnMount = async () => {
      try {
        const response = await fetchAllRosters() as AllPlayersApiResponse
        // Store full response in state and localStorage
        setAllPlayersData(response)
        saveAllPlayersDataToStorage(response)
        
        // Extract and set myRoster (players where fantasyTeam equals "Boykies")
        const myRoster = extractMyRoster(response)
        setMyRoster(myRoster)
        
        console.log('📊 myRoster extracted:', myRoster)
        
        // If we have a selected opponent, extract their roster too
        if (selectedOpponentTeam) {
          const opponentRoster = extractOpponentRoster(response, selectedOpponentTeam.name)
          setOpponentRosterData(opponentRoster)
          saveOpponentRosterToStorage(opponentRoster)
          console.log('📊 opponentRoster extracted:', opponentRoster)
        }
      } catch (error) {
        console.error('❌ API call failed. Error:', error)
      }
    }

    fetchOnMount()
  }, [selectedOpponentTeam]) // Re-run when selected opponent changes

  if (rostersLoading) {
    return (
      <div className="roster-comparison-loading">
        <div className="flex justify-center items-center py-8">
          <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem' }}></i>
          <span className="ml-2 text-lg">Loading rosters...</span>
        </div>
      </div>
    )
  }

  if (rostersError) {
    return (
      <div className="roster-comparison-error">
        <div className="text-center py-8">
          <i className="pi pi-exclamation-triangle" style={{ fontSize: '2rem', color: '#f59e0b' }}></i>
          <h3 className="text-lg font-semibold mt-2 mb-1">Error Loading Rosters</h3>
          <p className="text-gray-600">{rostersError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="roster-comparison">
      <div className="roster-comparison-grid">
        {/* Boykies Roster */}
        <div className="roster-table-wrapper">
          <RosterTable
            rows={boykiesLineup.rows}
            teamName="Boykies"
          />
        </div>

        {/* Opponent Roster */}
        <div className="roster-table-wrapper">
          <RosterTable
            rows={opponentLineup.rows}
            teamName={selectedOpponentTeam?.name || 'Select Opponent'}
          />
        </div>
      </div>
    </div>
  )
}