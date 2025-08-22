import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, ICellRendererParams } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { Checkbox } from 'primereact/checkbox'
import { Message } from 'primereact/message'

import type { Player } from '../types'
import { fetchPlayers } from '../lib/api'
import { useDraftStore } from '../state/draftStore'
import { Star, StarOff, TrendingUp, TrendingDown, Minus } from 'lucide-react'

const StarCell: React.FC<ICellRendererParams<Player>> = (params) => {
  const data = params.data
  const toggleStar = useDraftStore((s) => s.toggleStar)
  const isStarred = useDraftStore((s) => s.isStarred)
  if (!data) return null

  const starred = isStarred(data.id)

  return (
    <Button
      onClick={() => toggleStar(data.id)}
      className="p-button-text p-button-sm"
      style={{
        width: '2rem',
        height: '2rem',
        padding: 0,
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: '0.375rem'
      }}
      tooltip={starred ? 'Unstar' : 'Star'}
      tooltipOptions={{ position: 'top' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      {starred ? <Star className="w-4 h-4" /> : <StarOff className="w-4 h-4 opacity-70" />}
    </Button>
  )
}

const ActionButtonsCell: React.FC<ICellRendererParams<Player>> = (params) => {
  const data = params.data
  const draftPlayer = useDraftStore((s) => s.draftPlayer)
  const takePlayer = useDraftStore((s) => s.takePlayer)
  const isDrafted = useDraftStore((s) => s.isDrafted)
  const isTaken = useDraftStore((s) => s.isTaken)
  if (!data) return null

  const drafted = isDrafted(data.id)
  const taken = isTaken(data.id)
  const unavailable = drafted || taken

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      height: '100%',
      justifyContent: 'center'
    }}>
      <Button
        label={drafted ? 'Drafted' : 'Draft'}
        onClick={() => draftPlayer(data.id)}
        disabled={unavailable}
        className={unavailable ? 'p-button-secondary' : 'p-button-success'}
        size="small"
        style={{
          fontSize: '0.75rem',
          padding: '0.25rem 0.5rem'
        }}
        tooltip={unavailable ? 'Unavailable' : 'Add to my team'}
        tooltipOptions={{ position: 'top' }}
      />
      <Button
        label={taken ? 'Taken' : 'Taken'}
        onClick={() => takePlayer(data.id)}
        disabled={unavailable}
        className={unavailable ? 'p-button-secondary' : 'p-button-danger'}
        size="small"
        style={{
          fontSize: '0.75rem',
          padding: '0.25rem 0.5rem'
        }}
        tooltip={unavailable ? 'Unavailable' : 'Mark as taken'}
        tooltipOptions={{ position: 'top' }}
      />
    </div>
  )
}

const OverallRankCell: React.FC<ICellRendererParams<Player>> = (params) => {
  const data = params.data
  if (!data) return null

  const newRank = data.newOverallRank
  const prevRank = data.previousOverallRank
  
  // Handle null values
  if (newRank == null || prevRank == null) {
    return <span>{newRank}</span>
  }
  
  let icon = null
  
  if (newRank < prevRank) {
    // Lower number = better rank = green up arrow
    icon = <TrendingUp className="w-3 h-3" />
  } else if (newRank > prevRank) {
    // Higher number = worse rank = red down arrow
    icon = <TrendingDown className="w-3 h-3" />
  } else {
    // Same rank = yellow minus
    icon = <Minus className="w-3 h-3" />
  }

  return (
    <div className="flex items-center gap-1">
      <span style={{ marginRight: '3px' }}>{newRank}</span>
      <span style={{ color: newRank < prevRank ? '#22c55e' : newRank > prevRank ? '#ef4444' : '#eab308', display: 'flex' }}>{icon}</span>
    </div>
  )
}

const PositionRankCell: React.FC<ICellRendererParams<Player>> = (params) => {
  const data = params.data
  if (!data) return null

  const newRank = data.newPositionRank
  const prevRank = data.previousPositionRank
  
  // Handle null values
  if (newRank == null || prevRank == null) {
    return <span>{newRank}</span>
  }
  
  let icon = null
  
  if (newRank < prevRank) {
    // Lower number = better rank = green up arrow
    icon = <TrendingUp className="w-3 h-3" />
  } else if (newRank > prevRank) {
    // Higher number = worse rank = red down arrow
    icon = <TrendingDown className="w-3 h-3" />
  } else {
    // Same rank = yellow minus
    icon = <Minus className="w-3 h-3" />
  }

  return (
    <div className="flex items-center gap-1">
      <span style={{ marginRight: '3px' }}>{newRank}</span>
      <span style={{ color: newRank < prevRank ? '#22c55e' : newRank > prevRank ? '#ef4444' : '#eab308', display: 'flex' }}>{icon}</span>
    </div>
  )
}

const TeamLogoCell: React.FC<ICellRendererParams<Player>> = (params) => {
  const data = params.data
  if (!data || !data.team || !data.team.logoUrl) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        fontSize: '0.75rem',
        color: '#888'
      }}>
        {data?.team?.abbr || 'N/A'}
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      height: '100%',
      paddingLeft: '8px'
    }}>
      <img
        src={data.team.logoUrl}
        alt={data.team.abbr}
        style={{
          maxHeight: '32px',
          maxWidth: '32px',
          objectFit: 'contain'
        }}
        title={data.team.abbr}
        onError={(e) => {
          // Fallback to showing abbreviation if image fails to load
          const target = e.target as HTMLImageElement
          target.style.display = 'none'
          const parent = target.parentElement
          if (parent) {
            parent.innerHTML = `<span style="font-size: 0.75rem; color: #888">${data.team.abbr}</span>`
          }
        }}
      />
    </div>
  )
}

export const PlayersGrid: React.FC = () => {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['players'], queryFn: fetchPlayers })
  const isDrafted = useDraftStore((s) => s.isDrafted)
  const isTaken = useDraftStore((s) => s.isTaken)
  const isStarred = useDraftStore((s) => s.isStarred)
  const undoDraft = useDraftStore((s) => s.undoDraft)
  const resetDraft = useDraftStore((s) => s.resetDraft)

  const [quickFilter, setQuickFilter] = React.useState('')
  const [showStarredOnly, setShowStarredOnly] = React.useState(false)

  const filteredData = React.useMemo(() => {
    if (!data) return []
    return data.filter((p) => {
      if (isDrafted(p.id) || isTaken(p.id)) return false // hide drafted and taken
      if (showStarredOnly && !isStarred(p.id)) return false
      return true
    })
  }, [data, isDrafted, isTaken, isStarred, showStarredOnly])

  const colDefs = React.useMemo<ColDef<Player>[]>(() => [
    { headerName: '★', width: 70, cellRenderer: StarCell, suppressHeaderMenuButton: true, sortable: false, filter: false },
    { headerName: 'Name', field: 'name', flex: 1, minWidth: 180, filter: true },
    { headerName: 'Pos', field: 'position', width: 90, filter: true },
    { headerName: 'Team', field: 'team.abbr', width: 90, filter: true, cellRenderer: TeamLogoCell },
    { headerName: 'Ovr (new)', field: 'newOverallRank', width: 110, filter: 'agNumberColumnFilter', cellRenderer: OverallRankCell },
    { headerName: 'Ovr (prev)', field: 'previousOverallRank', width: 110, filter: 'agNumberColumnFilter' },
    { headerName: 'Pos (new)', field: 'newPositionRank', width: 110, filter: 'agNumberColumnFilter', cellRenderer: PositionRankCell },
    { headerName: 'Pos (prev)', field: 'previousPositionRank', width: 110, filter: 'agNumberColumnFilter' },
    { headerName: 'Exp Rd', field: 'expectedRound', width: 100, filter: 'agNumberColumnFilter' },
    { headerName: 'Bye', field: 'byeWeek', width: 90, filter: 'agNumberColumnFilter' },
    { headerName: 'Yrs', field: 'yearsPro', width: 90, filter: 'agNumberColumnFilter' },
    { headerName: 'Role', field: 'role', flex: 1, minWidth: 140, filter: true },
    { headerName: 'Comp', field: 'competitionLevel', width: 120, filter: true },
    { headerName: 'Actions', width: 150, cellRenderer: ActionButtonsCell, sortable: false, filter: false, suppressHeaderMenuButton: true },
  ], [])

  return (
    <section className="space-y-4">
      {/* Undo and Reset buttons */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '0.5rem',
        marginBottom: '1rem'
      }}>
        <Button
          label="Undo"
          icon="pi pi-undo"
          onClick={undoDraft}
          className="p-button-secondary"
          size="small"
          tooltip="Undo last drafted player"
          tooltipOptions={{ position: 'bottom' }}
          style={{
            backgroundColor: '#f1f5f9',
            borderColor: '#cbd5e1',
            color: '#475569'
          }}
        />
        <Button
          label="Reset"
          icon="pi pi-refresh"
          onClick={resetDraft}
          className="p-button-secondary"
          size="small"
          tooltip="Clear all drafted players (local only)"
          tooltipOptions={{ position: 'bottom' }}
          style={{
            backgroundColor: '#f1f5f9',
            borderColor: '#cbd5e1',
            color: '#475569'
          }}
        />
      </div>

      {/* Search and filter controls */}
      <div style={{
        display: 'flex',
        flexDirection: window.innerWidth < 768 ? 'column' : 'row',
        alignItems: window.innerWidth < 768 ? 'stretch' : 'center',
        justifyContent: 'space-between',
        gap: '0.5rem'
      }}>
        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
          {isLoading ? 'Loading players…' : isError ? (
            <Message
              severity="error"
              text={`Error: ${(error as Error)?.message}`}
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
            />
          ) : `${filteredData.length} players`}
        </div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <InputText
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value)}
            placeholder="Quick search…"
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              padding: '0.5rem 0.75rem',
              fontSize: '0.875rem',
              color: '#374151'
            }}
          />
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
            color: '#374151'
          }}>
            <Checkbox
              inputId="starred-only"
              checked={showStarredOnly}
              onChange={(e) => setShowStarredOnly(e.checked || false)}
            />
            <label htmlFor="starred-only">Show starred only</label>
          </div>
        </div>
      </div>

      <div
        className="ag-theme-quartz rounded-2xl overflow-hidden"
        style={{
          height: '650px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
        }}
      >
        <AgGridReact<Player>
          rowData={filteredData}
          columnDefs={colDefs}
          defaultColDef={{
            sortable: true,
            filter: true,
            resizable: true,
            flex: 0,
          }}
          quickFilterText={quickFilter}
          pagination
          paginationPageSize={25}
          paginationPageSizeSelector={[20, 25, 50, 100]}
          theme="legacy"
          animateRows
        />
      </div>
    </section>
  )
}
