/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Button } from 'primereact/button'
import { InputNumber } from 'primereact/inputnumber'
import type { ApiPlayer } from '../../types'
import { useRosterAnalysisStream } from '../../hooks/useRosterAnalysisStream'
import './RosterTable.css'

interface RosterTableProps {
  userRoster: ApiPlayer[];
  teamName: string;
  enableUserSelectionAndFocus?: boolean; // true for user table, false for opponent table
  onSelectedPlayersChange?: (selectedPlayers: ApiPlayer[]) => void;
  onAnalyzeRoster?: (players: ApiPlayer[]) => void;
  onResetAnalysis?: () => void;
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
  onSelectedPlayersChange,
  onAnalyzeRoster,
  onResetAnalysis
}) => {
  const safeUserRoster = Array.isArray(userRoster) ? userRoster : [];

  // Controlled selection (PrimeReact docs pattern)
  const [selectedPlayers, setSelectedPlayers] = useState<ApiPlayer[]>([]);
  const selectedCount = selectedPlayers.length;

  // State for default projected points values
  const [defaultValues, setDefaultValues] = useState<Record<string, number>>({});

  // Unique key for this table instance (user vs opponent)
  const tableKey = `${teamName}:${enableUserSelectionAndFocus ? 'user' : 'opponent'}`;

  // Loading state from roster analysis hook
  const { isStreaming } = useRosterAnalysisStream();
  
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
      console.log('selectedPlayers:', JSON.stringify(selectedPlayers, null, 2));
      onSelectedPlayersChange?.(selectedPlayers);
    }
  }, [tableKey, enableUserSelectionAndFocus, selectedCount, selectedPlayers, onSelectedPlayersChange]);

  // Position focus
  const [focusedPosition, setFocusedPosition] = useState<string | null>(null);

  // Analysis and reset functions
  const handleAnalyzeRoster = () => {
    if (!onAnalyzeRoster) return;
    
    let playersToAnalyze: ApiPlayer[];
    
    if (selectedPlayers.length > 0) {
      // If players are selected, analyze only selected players
      playersToAnalyze = selectedPlayers.map(player => ({
        ...player,
        matchup: {
          ...player.matchup,
          projectedPoints: {
            ...player.matchup.projectedPoints,
            default: defaultValues[player.name] ?? 0
          }
        }
      }));
    } else {
      // If no players selected, analyze all starting players
      playersToAnalyze = safeUserRoster
        .filter(player => player.starter)
        .map(player => ({
          ...player,
          matchup: {
            ...player.matchup,
            projectedPoints: {
              ...player.matchup.projectedPoints,
              default: defaultValues[player.name] ?? 0
            }
          }
        }));
    }
    
    onAnalyzeRoster(playersToAnalyze);
  };

  const handleAnalyzeBench = () => {
    if (!onAnalyzeRoster) return;
    
    // Analyze all bench players (non-starters)
    const playersToAnalyze = safeUserRoster
      .filter(player => !player.starter)
      .map(player => ({
        ...player,
        matchup: {
          ...player.matchup,
          projectedPoints: {
            ...player.matchup.projectedPoints,
            default: defaultValues[player.name] ?? 0
          }
        }
      }));
    
    onAnalyzeRoster(playersToAnalyze);
  };

  const handleResetAnalysis = () => {
    if (onResetAnalysis) {
      onResetAnalysis();
    }
    setSelectedPlayers([]);
    setDefaultValues({});
    setFocusedPosition(null);
  };

  // Default value change handler
  const handleDefaultValueChange = (playerName: string, value: number | null) => {
    setDefaultValues(prev => ({
      ...prev,
      [playerName]: value ?? 0
    }));
  };

  // Totals
  const totalProjectedPoints = safeUserRoster.reduce((total, player) => {
    const pp = player?.matchup?.projectedPoints;
    const pts = pp && typeof pp === 'object'
      ? (pp.llm ?? pp.default ?? 0)
      : (pp ?? 0);
    return total + pts;
  }, 0);

  // Pos button click
  function onPositionClick(rowData: ApiPlayer) {
    console.log('selectedPlayer:', rowData);
    const pos = (rowData?.position || '').toUpperCase();
    setFocusedPosition(prev => (prev === pos ? null : pos));
  }

  function positionBodyTemplate(rowData: ApiPlayer) {
    const label = (rowData?.position || '').toUpperCase() || '—';

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
  function isRowMatchPosition(rowData: ApiPlayer, focused: string | null) {
    if (!focused) return false;
    const rowPos = (rowData?.position || '').toUpperCase();
    if (focused === 'FLEX') return isFlexEligible(rowPos);
    return rowPos === focused;
  }
  function getRowClassName(rowData: ApiPlayer) {
    if (!focusedPosition) return {};
    return isRowMatchPosition(rowData, focusedPosition)
      ? { 'row-emphasized': true }
      : { 'row-muted': true };
  }

  // Default column template
  function defaultBodyTemplate(rowData: ApiPlayer) {
    return (
      <InputNumber
        value={defaultValues[rowData.name] ?? 0}
        onValueChange={(e) => handleDefaultValueChange(rowData.name, e.value ?? 0)}
        mode="decimal"
        minFractionDigits={0}
        maxFractionDigits={2}
        min={0}
        inputStyle={{ width: '85px' }}
      />
    );
  }

  // Opponent column template with home/away indicator
  function opponentBodyTemplate(player: ApiPlayer) {
    const isAwayGame = player.matchup?.type === 'away';
    
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
        {isAwayGame && <span style={{ fontSize: '14px', fontWeight: '500' }}>@</span>}
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
      </div>
    );
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

      {/* Analysis buttons - only show for user table */}
      {enableUserSelectionAndFocus && (onAnalyzeRoster || onResetAnalysis) && (
        <div className="mb-4 mt-4 flex gap-2">
          {onAnalyzeRoster && (
            <Button
              label="Analyze Starters"
              icon="pi pi-chart-line"
              onClick={handleAnalyzeRoster}
              className="p-button-primary"
              size="small"
              disabled={isStreaming}
            />
          )}
          {onAnalyzeRoster && (
            <Button
              label="Analyze Bench"
              icon="pi pi-chart-bar"
              onClick={handleAnalyzeBench}
              className="p-button-primary"
              size="small"
              disabled={isStreaming}
            />
          )}
          {onResetAnalysis && (
            <Button
              label="Reset Analysis"
              icon="pi pi-refresh"
              onClick={handleResetAnalysis}
              className="p-button-secondary"
              size="small"
              disabled={isStreaming}
            />
          )}
        </div>
      )}

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
        >
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
            body={opponentBodyTemplate}
            style={{ width: '65px', textAlign: 'center' }}
            headerStyle={{ width: '65px', textAlign: 'center' }}
          />

          {/* Default column */}
          <Column
            header="Default"
            body={defaultBodyTemplate}
            style={{ width: '100px', textAlign: 'center' }}
            headerStyle={{ width: '100px', textAlign: 'center' }}
          />

          {/* Projected points */}
          <Column
            header="Proj"
            body={(player) => {
              const pp = player?.matchup?.projectedPoints;
              const pts = pp && typeof pp === 'object'
                ? (pp.llm ?? pp.default ?? 0)
                : (pp ?? 0);
              return pts.toFixed(2);
            }}
            style={{ width: '6rem', textAlign: 'right' }}
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
            body={(player) => player.position}
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
            body={opponentBodyTemplate}
            style={{ width: '65px', textAlign: 'center' }}
            headerStyle={{ width: '65px', textAlign: 'center' }}
          />
          <Column
            header="Proj"
            body={(player) => {
              const pp = player?.matchup?.projectedPoints;
              const pts = pp && typeof pp === 'object'
                ? (pp.llm ?? pp.default ?? 0)
                : (pp ?? 0);
              return pts.toFixed(2);
            }}
            style={{ width: '6rem', textAlign: 'right' }}
          />

        </DataTable>
      )}
    </div>
  )
}