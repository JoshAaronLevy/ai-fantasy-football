import React from 'react'
import { Dropdown } from 'primereact/dropdown'
import { useSeasonStore } from '../../state'
import type { SeasonTeam } from '../../types'

export const TeamSelector: React.FC = () => {
  const availableTeams = useSeasonStore(s => s.availableTeams)
  const selectedOpponentTeam = useSeasonStore(s => s.selectedOpponentTeam)
  const rostersLoading = useSeasonStore(s => s.rostersLoading)
  const allPlayersData = useSeasonStore(s => s.allPlayersData)
  const setSelectedOpponentTeam = useSeasonStore(s => s.setSelectedOpponentTeam)
  const fetchRosterComparison = useSeasonStore(s => s.fetchRosterComparison)
  const setOpponentRosterData = useSeasonStore(s => s.setOpponentRosterData)
  const extractOpponentRoster = useSeasonStore(s => s.extractOpponentRoster)
  const saveOpponentRosterToStorage = useSeasonStore(s => s.saveOpponentRosterToStorage)

  // Filter out Boykies team from opponent options
  const opponentTeams = availableTeams.filter(team => team.name !== 'Boykies')

  const handleTeamChange = async (team: SeasonTeam | null) => {
    if (!team) return
    
    setSelectedOpponentTeam(team)
    
    // If we have allPlayersData, extract opponent roster immediately
    if (allPlayersData) {
      const opponentRoster = extractOpponentRoster(allPlayersData, team.name)
      setOpponentRosterData(opponentRoster)
      saveOpponentRosterToStorage(opponentRoster)
      console.log('🏆 Team selected - opponentRoster:', opponentRoster)
    }
    
    try {
      await fetchRosterComparison(team.name)
    } catch (error) {
      console.error('Failed to fetch opponent roster:', error)
    }
  }

  const teamOptionTemplate = (option: SeasonTeam) => {
    return (
      <div className="flex items-center gap-2">
        <img 
          src={option.logoUrl} 
          alt={`${option.name} logo`}
          className="team-logo team-logo-sm"
          onError={(e) => {
            const target = e.target as HTMLImageElement
            target.style.display = 'none'
            target.nextElementSibling?.setAttribute('style', 'display: flex')
          }}
        />
        <div 
          className="team-fallback team-fallback-sm" 
          style={{ display: 'none' }}
        >
          {option.abbreviation}
        </div>
        <span>{option.name}</span>
      </div>
    )
  }

  const selectedTeamTemplate = (option: SeasonTeam | null) => {
    if (!option) return <span>Select opponent team...</span>
    
    return (
      <div className="flex items-center gap-2">
        <img 
          src={option.logoUrl} 
          alt={`${option.name} logo`}
          className="team-logo team-logo-sm"
          onError={(e) => {
            const target = e.target as HTMLImageElement
            target.style.display = 'none'
            target.nextElementSibling?.setAttribute('style', 'display: flex')
          }}
        />
        <div 
          className="team-fallback team-fallback-sm" 
          style={{ display: 'none' }}
        >
          {option.abbreviation}
        </div>
        <span>{option.name}</span>
      </div>
    )
  }

  return (
    <div className="team-selector">
      <Dropdown
        value={selectedOpponentTeam}
        options={opponentTeams}
        onChange={(e) => handleTeamChange(e.value)}
        optionLabel="name"
        placeholder="Select opponent team..."
        itemTemplate={teamOptionTemplate}
        valueTemplate={selectedTeamTemplate}
        disabled={rostersLoading}
        className="team-selector-dropdown"
        style={{ minWidth: '200px' }}
        panelStyle={{ minWidth: '200px' }}
      />
    </div>
  )
}