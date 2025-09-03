import React from 'react'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import type { RosterApiPlayer } from '../../types'

interface RosterTableProps {
  userRoster: RosterApiPlayer[];
  teamName: string;
}

export const RosterTable: React.FC<RosterTableProps> = ({ userRoster, teamName }) => {
  // Ensure userRoster is always an array to prevent TypeError
  const safeUserRoster = Array.isArray(userRoster) ? userRoster : []

  // Calculate total projected points from roster
  const totalProjectedPoints = safeUserRoster.reduce((total, player) => {
    return total + (player.matchup?.projectedPoints ?? 0)
  }, 0)

  return (
    <div className="roster-table-container">
      <div className="roster-table-header">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{teamName}</h3>
          <div className="text-sm">
            <span className="font-semibold">Total: {totalProjectedPoints.toFixed(1)} pts</span>
          </div>
        </div>
      </div>
      
      <DataTable
        value={safeUserRoster}
        dataKey="name"
        size="small"
        className="roster-data-table"
        stripedRows
        showGridlines={false}
        style={{ fontSize: '0.875rem' }}
      >
        <Column
          header="Pos"
          body={(player) => player.position ?? player.pos}
          style={{ width: '60px', textAlign: 'center' }}
          headerStyle={{ width: '60px', textAlign: 'center' }}
        />

        <Column
          header="Player"
          body={(player) => player.name}
          style={{ minWidth: '180px' }}
        />
        
        <Column
          header="Team"
          body={(player) => {
            const team = typeof player.team === 'string'
              ? { abbr: player.team, logoUrl: undefined }
              : player.team;
            return (
              <img
                src={team?.logoUrl ?? ''}
                alt={team?.abbr ?? ''}
                width={32}
                height={32}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            );
          }}
          style={{ width: '65px', textAlign: 'center' }}
          headerStyle={{ width: '65px', textAlign: 'center' }}
        />

        <Column
          header="Opponent"
          body={(player) => (
            <img
              src={player.matchup?.opponent?.logoUrl ?? ''}
              alt={player.matchup?.opponent?.abbr ?? ''}
              width={32}
              height={32}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
          )}
          style={{ width: '65px', textAlign: 'center' }}
          headerStyle={{ width: '65px', textAlign: 'center' }}
        />

        <Column
          header="Proj"
          body={(player) => (player.matchup?.projectedPoints ?? 0).toFixed(2)}
          style={{ width: '70px', textAlign: 'right' }}
          headerStyle={{ width: '70px', textAlign: 'right' }}
        />
      </DataTable>
    </div>
  )
}