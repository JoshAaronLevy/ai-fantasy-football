/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Button } from 'primereact/button'
import type { RosterApiPlayer } from '../../types'
import './RosterTable.css'

interface RosterTableProps {
  userRoster: RosterApiPlayer[];
  teamName: string;
  enableUserSelectionAndFocus?: boolean; // true for user table, false for opponent table
  onSelectedPlayersChange?: (selectedPlayers: RosterApiPlayer[]) => void;
}

/**
 * Dev/StrictMode safe guards:
 * - We persist "has initial log happened" per table key across unmount/remount.
 * - We also persist last logged count per table to only log on length changes.
 */
const __initialLoggedKeys = new Set<string>();
const __prevCountByKey = new Map<string, number>();

export const RosterTable: React.FC<RosterTableProps> = ({
  userRoster,
  teamName,
  enableUserSelectionAndFocus = false,
  onSelectedPlayersChange
}) => {
  const safeUserRoster = Array.isArray(userRoster) ? userRoster : [];

  // Controlled selection (PrimeReact docs pattern)
  const [selectedPlayers, setSelectedPlayers] = useState<RosterApiPlayer[]>([]);
  const selectedCount = selectedPlayers.length;

  // Unique key for this table instance (user vs opponent)
  const tableKey = `${teamName}:${enableUserSelectionAndFocus ? 'user' : 'opponent'}`;

  useEffect(() => {
    // Only log for the USER table (selection is disabled for opponent)
    if (!enableUserSelectionAndFocus) return;

    const hasInitial = __initialLoggedKeys.has(tableKey);
    const lastCount = __prevCountByKey.get(tableKey);

    if (!hasInitial) {
      // First-ever log for this tableKey (survives StrictMode)
      __initialLoggedKeys.add(tableKey);
      __prevCountByKey.set(tableKey, selectedCount);
      console.log('selectedPlayers:', selectedPlayers);
      onSelectedPlayersChange?.(selectedPlayers);
      return;
    }

    // Subsequent logs only when length changes
    if (lastCount !== selectedCount) {
      __prevCountByKey.set(tableKey, selectedCount);
      console.log('selectedPlayers:', selectedPlayers);
      onSelectedPlayersChange?.(selectedPlayers);
    }
  }, [tableKey, enableUserSelectionAndFocus, selectedCount, selectedPlayers, onSelectedPlayersChange]);

  // Position focus
  const [focusedPosition, setFocusedPosition] = useState<string | null>(null);

  // Totals
  const totalProjectedPoints = safeUserRoster.reduce((total, player) => {
    return total + (player.projectedPoints ?? player.matchup?.projectedPoints ?? 0);
  }, 0);

  // Pos button click
  function onPositionClick(rowData: RosterApiPlayer) {
    console.log('selectedPlayer:', rowData);
    const pos = ((rowData?.position || rowData?.pos || '') as string).toUpperCase();
    setFocusedPosition(prev => (prev === pos ? null : pos));
  }

  function positionBodyTemplate(rowData: RosterApiPlayer) {
    const label =
      ((rowData?.position || rowData?.pos || '') as string).toUpperCase() || '—';

    const isFocused =
      !!focusedPosition && isRowMatchPosition(rowData, focusedPosition);

    // When NOT focused -> text + raised
    // When focused     -> contained (no modifiers)
    const className = isFocused ? undefined : 'p-button-text p-button-raised';

    return (
      <Button
        label={label}
        size="small"
        className={className}
        style={{ padding: '0.4rem 0.75rem' }}
        onClick={() => onPositionClick(rowData)}
      />
    );
  }

  // Emphasis helpers
  function isFlexEligible(pos: string) {
    const p = pos.toUpperCase();
    return p === 'RB' || p === 'WR' || p === 'TE';
  }
  function isRowMatchPosition(rowData: RosterApiPlayer, focused: string | null) {
    if (!focused) return false;
    const rowPos = ((rowData?.position || rowData?.pos || '') as string).toUpperCase();
    if (focused === 'FLEX') return isFlexEligible(rowPos);
    return rowPos === focused;
  }
  function getRowClassName(rowData: RosterApiPlayer) {
    if (!focusedPosition) return {};
    return isRowMatchPosition(rowData, focusedPosition)
      ? { 'row-emphasized': true }
      : { 'row-muted': true };
  }

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

      {enableUserSelectionAndFocus ? (
        <DataTable
          value={safeUserRoster}
          dataKey="name"                 // unique per roster (your guarantee)
          size="small"
          className="roster-data-table"
          stripedRows
          showGridlines={false}
          style={{ fontSize: '0.875rem' }}
          rowHover={false}              // row is NOT clickable for selection
          rowClassName={getRowClassName}
          // selection via checkbox column (PrimeReact docs pattern)
          selectionMode="multiple"
          selection={selectedPlayers}
          onSelectionChange={(e) => setSelectedPlayers((e.value as RosterApiPlayer[]) ?? [])}
        >
          {/* Checkbox column */}
          <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} style={{ width: '3rem' }} />

          {/* Pos button */}
          <Column
            header="Pos"
            body={positionBodyTemplate}
            style={{ width: '60px', textAlign: 'center' }}
            headerStyle={{ width: '60px', textAlign: 'center' }}
          />

          {/* Player */}
          <Column
            header="Player"
            body={(player) => player.name}
            style={{ minWidth: '180px' }}
          />

          {/* Team */}
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

          {/* Opponent */}
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

          {/* Projected points */}
          <Column
            header="Proj"
            body={(player) => (player.projectedPoints ?? player.matchup?.projectedPoints ?? 0).toFixed(2)}
            style={{ width: '70px', textAlign: 'right' }}
            headerStyle={{ width: '70px', textAlign: 'right' }}
          />
        </DataTable>
      ) : (
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
            body={(player) => (player.projectedPoints ?? player.matchup?.projectedPoints ?? 0).toFixed(2)}
            style={{ width: '70px', textAlign: 'right' }}
            headerStyle={{ width: '70px', textAlign: 'right' }}
          />
        </DataTable>
      )}
    </div>
  )
}