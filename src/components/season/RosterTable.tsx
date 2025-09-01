import React from 'react'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import type { ShapedRow } from '../../season/lib/shapeLineup'

interface RosterTableProps {
  rows: ShapedRow[];
  teamName: string;
}

export const RosterTable: React.FC<RosterTableProps> = ({ rows, teamName }) => {

  const positionTemplate = (rowData: ShapedRow) => {
    return (
      <span className="position-badge">
        {rowData.slotPosition}
      </span>
    )
  }

  const playerTemplate = (rowData: ShapedRow) => {
    if (rowData.name === '---') {
      return (
        <span className="text-gray-400 italic">
          {rowData.slotPosition === 'BN' ? 'Empty' : `No ${rowData.slotPosition} Player`}
        </span>
      )
    }

    return (
      <div className="player-info">
        <div className="font-semibold">{rowData.name}</div>
      </div>
    )
  }

  const teamTemplate = (rowData: ShapedRow) => {
    if (!rowData.teamAbbr || rowData.teamAbbr === '---') {
      return <span className="text-gray-400">---</span>
    }

    return (
      <div className="flex items-center justify-center">
        {rowData.teamLogoUrl ? (
          <>
            <img
              src={rowData.teamLogoUrl}
              alt={`${rowData.teamAbbr} logo`}
              className="team-logo team-logo-sm"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
                const fallback = target.nextElementSibling as HTMLElement
                if (fallback) {
                  fallback.style.display = 'flex'
                }
              }}
            />
            <div
              className="team-fallback team-fallback-sm"
              style={{ display: 'none' }}
            >
              {rowData.teamAbbr}
            </div>
          </>
        ) : (
          <span>{rowData.teamAbbr}</span>
        )}
      </div>
    )
  }

  const projectionTemplate = (rowData: ShapedRow) => {
    if (rowData.projPoints === null || rowData.projPoints === undefined) {
      return <span className="text-gray-400">-</span>
    }

    return (
      <span className="font-semibold">
        {rowData.projPoints.toFixed(1)}
      </span>
    )
  }

  // Calculate total projected points from rows
  const totalProjectedPoints = rows.reduce((total, row) => {
    return total + (row.projPoints || 0)
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
        value={rows}
        size="small"
        className="roster-data-table"
        stripedRows
        showGridlines={false}
        style={{ fontSize: '0.875rem' }}
      >
        <Column 
          field="slotPosition" 
          header="Pos" 
          body={positionTemplate}
          style={{ width: '60px', textAlign: 'center' }}
          headerStyle={{ width: '60px', textAlign: 'center' }}
        />
        
        <Column 
          field="name" 
          header="Player" 
          body={playerTemplate}
          style={{ minWidth: '180px' }}
        />
        
        <Column 
          field="team" 
          header="Team" 
          body={teamTemplate}
          style={{ width: '60px', textAlign: 'center' }}
          headerStyle={{ width: '60px', textAlign: 'center' }}
        />
        
        <Column
          field="projPoints"
          header="Proj. Points"
          body={projectionTemplate}
          style={{ width: '80px', textAlign: 'right' }}
          headerStyle={{ width: '80px', textAlign: 'right' }}
        />
      </DataTable>
    </div>
  )
}