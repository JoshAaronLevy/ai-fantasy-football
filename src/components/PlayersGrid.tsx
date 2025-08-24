/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, ICellRendererParams } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { Checkbox } from 'primereact/checkbox'
import { Message } from 'primereact/message'
import { Toast } from 'primereact/toast'

import type { Player } from '../types'
import { useDraftStore } from '../state/draftStore'
import { DraftConfigModal } from './DraftConfigModal'
import { Star, StarOff, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { playerTaken, userTurn } from '../lib/api'
import { useLlmStream } from '../hooks/useLlmStream'

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

const ActionButtonsCell: React.FC<ICellRendererParams<Player> & { toast: React.RefObject<Toast | null> }> = (params) => {
  const { data, toast } = params
  const draftPlayer = useDraftStore((s) => s.draftPlayer)
  const takePlayer = useDraftStore((s) => s.takePlayer)
  const isDrafted = useDraftStore((s) => s.isDrafted)
  const isTaken = useDraftStore((s) => s.isTaken)
  const canDraft = useDraftStore((s) => s.canDraft)
  const canTake = useDraftStore((s) => s.canTake)
  const isDraftConfigured = useDraftStore((s) => s.isDraftConfigured)
  const getCurrentPick = useDraftStore((s) => s.getCurrentPick)
  const conversationId = useDraftStore((s) => s.conversationId)
  const markPlayerTaken = useDraftStore((s) => s.markPlayerTaken)
  const markUserTurn = useDraftStore((s) => s.markUserTurn)
  const getPicksUntilMyTurn = useDraftStore((s) => s.getPicksUntilMyTurn)
  const players = useDraftStore((s) => s.players)
  const myTeam = useDraftStore((s) => s.myTeam)
  const getCurrentRound = useDraftStore((s) => s.getCurrentRound)
  const isOfflineMode = useDraftStore((s) => s.isOfflineMode)
  const setOfflineMode = useDraftStore((s) => s.setOfflineMode)
  const setShowOfflineBanner = useDraftStore((s) => s.setShowOfflineBanner)
  const addPendingApiCall = useDraftStore((s) => s.addPendingApiCall)
  const draftConfig = useDraftStore((s) => s.draftConfig)
  
  // Streaming integration
  const [{ tokens, isStreaming, error, conversationId: streamConvId }, { start, abort, clear }] = useLlmStream()
  
  if (!data) return null

  const drafted = isDrafted(data.id)
  const taken = isTaken(data.id)
  const unavailable = drafted || taken
  
  // If draft is not configured, use original behavior
  if (!isDraftConfigured()) {
    const handleDraftClick = () => {
      if (!unavailable) {
        draftPlayer(data.id);
      }
    }

    const handleTakeClick = () => {
      if (!unavailable) {
        takePlayer(data.id);
      }
    }

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
          onClick={handleDraftClick}
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
          label='Taken'
          onClick={handleTakeClick}
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

  // Snake draft behavior when configured
  const canDraftThisPlayer = canDraft() && !unavailable
  const canTakeThisPlayer = canTake() && !unavailable

  const handleDraftClick = async () => {
    if (!canDraftThisPlayer || !data) return;
    
    const currentPick = getCurrentPick();
    const currentRound = getCurrentRound();
    
    // First, draft the player locally
    draftPlayer(data.id);
    
    // Show immediate success toast
    toast.current?.show({
      severity: 'success',
      summary: `Pick ${currentPick}: ${data.position} - ${data.name} - ${data.team?.abbr || 'N/A'}`,
      life: 3000,
      className: 'center-toast'
    });
    
    // Skip streaming if offline or not configured
    if (isOfflineMode || !isDraftConfigured() || !conversationId || !draftConfig.teams || !draftConfig.pick) {
      return;
    }
    
    try {
      // Build user roster (current team)
      const userRoster = players.filter(p => myTeam[p.id]);
      
      // Get available players (top 200 for efficiency)
      const availablePlayers = players
        .filter(p => !isDrafted(p.id) && !isTaken(p.id) && p.id !== data.id)
        .slice(0, 200);
      
      // Validate required fields
      if (userRoster.length === 0 || availablePlayers.length === 0) {
        console.warn('Skipping streaming: insufficient roster or available players');
        return;
      }
      
      // Start streaming analysis
      await start({
        scope: 'draft',
        action: 'user-turn',
        payload: {
          player: data,
          round: currentRound,
          pick: currentPick,
          userRoster: userRoster,
          availablePlayers: availablePlayers
        }
      });
      
      // Show streaming toast
      toast.current?.show({
        severity: 'info',
        summary: 'AI Analysis Started',
        detail: 'Generating draft recommendations...',
        life: 2000
      });
      
    } catch (streamError) {
      console.error('Streaming failed:', streamError);
      
      // Fall back to offline mode
      setOfflineMode(true);
      setShowOfflineBanner(true);
      
      toast.current?.show({
        severity: 'warn',
        summary: 'AI Analysis Unavailable',
        detail: 'Draft recorded. AI analysis failed.',
        life: 3000
      });
    }
  }

  const handleTakeClick = async () => {
    if (!canTakeThisPlayer || !data) return;
    
    const currentPick = getCurrentPick();
    const currentRound = getCurrentRound();
    
    // ALWAYS update local state immediately (non-blocking)
    takePlayer(data.id);
    
    // Show immediate toast for taken player
    toast.current?.show({
      severity: 'error',
      summary: `Pick ${currentPick}: ${data.position} - ${data.name} - ${data.team?.abbr || 'N/A'}`,
      life: 2000,
      className: 'center-toast'
    });
    
    // Skip API call if already in offline mode or no conversation
    if (isOfflineMode || !isDraftConfigured() || !conversationId) {
      return;
    }
    
    // Make API call in background (non-blocking)
    try {
      // Check if it's about to be the user's turn (after this pick)
      const picksUntilMyTurn = getPicksUntilMyTurn();
      const isUserTurnNext = picksUntilMyTurn === 1;
      
      if (isUserTurnNext) {
        // Get user's current roster (players with drafted: true)
        const userRoster = players.filter(p => myTeam[p.id]);
        
        // Get top 25 available players (not drafted or taken)
        const availablePlayers = players
          .filter(p => !isDrafted(p.id) && !isTaken(p.id) && p.id !== data.id)
          .slice(0, 25);
        
        // Call userTurn API
        const response = await userTurn({
          player: data,
          round: currentRound,
          pick: currentPick,
          userRoster: userRoster,
          availablePlayers: availablePlayers,
          conversationId: conversationId
        });
        
        // Update with AI analysis (this will update the conversation)
        markUserTurn(data.id, data, response.analysis, currentRound, currentPick, response.conversationId);
        
        // Show additional toast for AI analysis
        toast.current?.show({
          severity: 'info',
          summary: 'AI Analysis Updated',
          detail: 'Your turn is next! Check the AI drawer for recommendations.',
          life: 4000
        });
      } else {
        // Regular player taken API call
        const response = await playerTaken({
          player: data,
          conversationId: conversationId
        });
        
        // Update with AI confirmation (this will update the conversation)
        markPlayerTaken(data.id, data, response.confirmation, response.conversationId);
      }
      
    } catch (error) {
      console.error('Failed to call API:', error);
      
      // Enter offline mode for future calls
      setOfflineMode(true);
      setShowOfflineBanner(true);
      
      // Store the failed API call for potential retry
      const apiPayload = {
        player: data,
        conversationId: conversationId,
        ...(getPicksUntilMyTurn() === 1 ? {
          round: currentRound,
          pick: currentPick,
          userRoster: players.filter(p => myTeam[p.id]),
          availablePlayers: players.filter(p => !isDrafted(p.id) && !isTaken(p.id) && p.id !== data.id).slice(0, 25)
        } : {})
      };
      
      addPendingApiCall(
        getPicksUntilMyTurn() === 1 ? 'userTurn' : 'playerTaken',
        apiPayload
      );
      
      // Show offline mode toast
      toast.current?.show({
        severity: 'warn',
        summary: 'API Connection Lost',
        detail: 'Player marked locally. AI analysis unavailable until connection restored.',
        life: 4000
      });
    }
  }

  // Check validation for streaming
  const userRoster = players.filter(p => myTeam[p.id]);
  const availablePlayers = players.filter(p => !isDrafted(p.id) && !isTaken(p.id));
  const hasValidPayload = userRoster.length > 0 && availablePlayers.length > 0 &&
                         draftConfig.teams && draftConfig.pick && conversationId;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      height: '100%',
      justifyContent: 'center'
    }}>
      <Button
        label={drafted ? 'Drafted' : isStreaming ? 'Streaming...' : 'Draft'}
        onClick={handleDraftClick}
        disabled={!canDraftThisPlayer || isStreaming}
        className={!canDraftThisPlayer || isStreaming ? 'p-button-secondary' : 'p-button-success'}
        size="small"
        style={{
          fontSize: '0.75rem',
          padding: '0.25rem 0.5rem'
        }}
        tooltip={
          unavailable ? 'Unavailable' :
          !canDraft() ? 'Not your turn' :
          isStreaming ? 'AI analysis in progress...' :
          !hasValidPayload ? 'Missing roster or config for AI analysis' :
          'Add to my team'
        }
        tooltipOptions={{ position: 'top' }}
      />
      
      {/* Stop button when streaming */}
      {isStreaming && (
        <Button
          icon="pi pi-stop"
          onClick={abort}
          className="p-button-danger"
          size="small"
          style={{
            fontSize: '0.75rem',
            padding: '0.25rem 0.5rem'
          }}
          tooltip="Stop AI analysis"
          tooltipOptions={{ position: 'top' }}
        />
      )}
      
      <Button
        label='Taken'
        onClick={handleTakeClick}
        disabled={!canTakeThisPlayer}
        className={!canTakeThisPlayer ? 'p-button-secondary' : 'p-button-danger'}
        size="small"
        style={{
          fontSize: '0.75rem',
          padding: '0.25rem 0.5rem'
        }}
        tooltip={
          unavailable ? 'Unavailable' :
          !canTake() ? 'Your turn to draft' :
          'Mark as taken'
        }
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
  // Read players data from store instead of React Query
  const data = useDraftStore((s) => s.players)
  const isLoading = useDraftStore((s) => s.playersLoading)
  const isError = useDraftStore((s) => s.playersError !== null)
  const error = useDraftStore((s) => s.playersError)
  
  // Draft store selectors
  const isDrafted = useDraftStore((s) => s.isDrafted)
  const isTaken = useDraftStore((s) => s.isTaken)
  const isStarred = useDraftStore((s) => s.isStarred)
  const undoDraft = useDraftStore((s) => s.undoDraft)
  const resetDraft = useDraftStore((s) => s.resetDraft)
  const currentRound = useDraftStore((s) => s.currentRound)
  const actionHistory = useDraftStore((s) => s.actionHistory)
  const drafted = useDraftStore((s) => s.drafted)
  const taken = useDraftStore((s) => s.taken)
  const isMyTurn = useDraftStore((s) => s.isMyTurn)
  const getPicksUntilMyTurn = useDraftStore((s) => s.getPicksUntilMyTurn)

  const [quickFilter, setQuickFilter] = React.useState('')
  const [showStarredOnly, setShowStarredOnly] = React.useState(false)
  const [animateRound, setAnimateRound] = React.useState(false)
  const [prevRound, setPrevRound] = React.useState(currentRound)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [gridApi, setGridApi] = React.useState<any>(null)
  const [showConfigModal, setShowConfigModal] = React.useState(false)
  const [prevIsMyTurn, setPrevIsMyTurn] = React.useState(false)
  const [prevPicksUntilTurn, setPrevPicksUntilTurn] = React.useState(0)
  const [hidingPlayerIds, setHidingPlayerIds] = React.useState<Set<string>>(new Set())

  const toast = React.useRef<Toast>(null)
  const draftConfig = useDraftStore((s) => s.draftConfig)
  const isDraftConfigured = useDraftStore((s) => s.isDraftConfigured)
  const hideDraftedPlayers = useDraftStore((s) => s.hideDraftedPlayers)
  const toggleHideDraftedPlayers = useDraftStore((s) => s.toggleHideDraftedPlayers)
  
  // Streaming hook for reset conversation functionality
  const [, { clear }] = useLlmStream()

  // Handle round change animation
  React.useEffect(() => {
    if (currentRound !== prevRound) {
      setAnimateRound(true)
      setPrevRound(currentRound)
      const timer = setTimeout(() => setAnimateRound(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [currentRound, prevRound])

  // Monitor turn changes for toast notifications
  React.useEffect(() => {
    if (!isDraftConfigured()) return

    const currentIsMyTurn = isMyTurn()
    const currentPicksUntilTurn = getPicksUntilMyTurn()

    // Show "You're up next" toast when exactly 1 pick until my turn
    if (currentPicksUntilTurn === 1 && prevPicksUntilTurn !== 1) {
      toast.current?.show({
        severity: 'warn',
        summary: "You're up next!",
        life: 0, // Keep until dismissed
        className: 'top-right-toast'
      })
    }

    // Show "It's your turn" toast when it becomes my turn
    if (currentIsMyTurn && !prevIsMyTurn) {
      // Clear any existing "up next" toast
      toast.current?.clear()
      
      toast.current?.show({
        severity: 'success',
        summary: "It's your turn!",
        life: 0, // Keep until I draft
        className: 'top-right-toast'
      })
    }

    // Clear turn toasts when I've drafted (no longer my turn after drafting)
    if (!currentIsMyTurn && prevIsMyTurn) {
      toast.current?.clear()
    }

    setPrevIsMyTurn(currentIsMyTurn)
    setPrevPicksUntilTurn(currentPicksUntilTurn)
  }, [isMyTurn(), getPicksUntilMyTurn(), prevIsMyTurn, prevPicksUntilTurn, isDraftConfigured])

  // Force AG Grid to refresh when state changes
  React.useEffect(() => {
    if (gridApi) {
      gridApi.refreshCells();
    }
  }, [gridApi, actionHistory, drafted, taken])

  // Handle smooth hiding of drafted players
  React.useEffect(() => {
    if (hideDraftedPlayers) {
      // When hiding is enabled, immediately start hiding any drafted/taken players
      const draftedTakenIds = data?.filter(p => isDrafted(p.id) || isTaken(p.id)).map(p => p.id) || []
      if (draftedTakenIds.length > 0) {
        setHidingPlayerIds(new Set(draftedTakenIds))
      }
    } else {
      // When hiding is disabled, clear the hiding set
      setHidingPlayerIds(new Set())
    }
  }, [hideDraftedPlayers, data, isDrafted, isTaken])

  // Handle smooth removal with delay when new players are drafted/taken
  React.useEffect(() => {
    if (!hideDraftedPlayers) return

    const lastAction = actionHistory[actionHistory.length - 1]
    if (lastAction) {
      const playerId = lastAction.id
      if (!hidingPlayerIds.has(playerId)) {
        // Add a 2-second delay before hiding the player
        const timer = setTimeout(() => {
          setHidingPlayerIds(prev => new Set([...prev, playerId]))
        }, 2000)
        return () => clearTimeout(timer)
      }
    }
  }, [actionHistory, hideDraftedPlayers, hidingPlayerIds])

  // Handle undo functionality - remove players from hiding set when undone
  const prevActionHistoryLength = React.useRef(actionHistory.length)
  React.useEffect(() => {
    if (actionHistory.length < prevActionHistoryLength.current) {
      // An undo occurred, check which player was undone
      const currentPlayerIds = new Set(actionHistory.map(action => action.id))
      setHidingPlayerIds(prev => {
        const newSet = new Set(prev)
        for (const playerId of prev) {
          if (!currentPlayerIds.has(playerId)) {
            newSet.delete(playerId)
          }
        }
        return newSet
      })
    }
    prevActionHistoryLength.current = actionHistory.length
  }, [actionHistory])

  const filteredData = React.useMemo(() => {
    if (!data) return []
    return data.filter((p) => {
      // If hideDraftedPlayers is enabled, filter out players that are being hidden
      if (hideDraftedPlayers && hidingPlayerIds.has(p.id)) return false
      
      // If hideDraftedPlayers is disabled, show all players (including drafted/taken)
      // This allows drafted/taken players to remain visible with disabled buttons
      
      if (showStarredOnly && !isStarred(p.id)) return false
      return true
    })
  }, [data, isStarred, showStarredOnly, hideDraftedPlayers, hidingPlayerIds])

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
    { headerName: 'Role', field: 'role', width: 140, filter: true },
    { headerName: 'Comp', field: 'competitionLevel', width: 120, filter: true },
    {
      headerName: 'Actions',
      width: 160,
      cellRenderer: (params: ICellRendererParams<Player>) => <ActionButtonsCell {...params} toast={toast} />,
      sortable: false,
      filter: false,
      suppressHeaderMenuButton: true,
      pinned: 'right'
    },
  ], [toast])

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
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          {/* Round Indicator */}
          <div
            className={animateRound ? 'round-indicator-animate' : 'round-indicator'}
            style={{
              backgroundColor: '#f1f5f9',
              borderColor: '#cbd5e1',
              border: '1px solid',
              borderRadius: '0.375rem',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: '#475569',
              position: 'relative',
              overflow: 'hidden',
              minWidth: '80px',
              textAlign: 'center'
            }}
          >
            <span
              key={currentRound}
              className={animateRound ? 'round-number-animate' : 'round-number'}
              style={{
                display: 'inline-block'
              }}
            >
              Round {currentRound}
            </span>
          </div>

          {/* Draft Configuration Display */}
          {isDraftConfigured() ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '0.375rem',
                padding: '0.5rem 0.75rem',
                fontSize: '0.875rem',
                color: '#475569'
              }}>
                {draftConfig.teams} Teams, Pick {draftConfig.pick}
              </div>
              <Button
                label="Update Setup"
                onClick={() => setShowConfigModal(true)}
                className="p-button-outlined p-button-sm"
                size="small"
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem'
                }}
              />
            </div>
          ) : (
            <Button
              label="Configure Draft"
              onClick={() => setShowConfigModal(true)}
              className="p-button-success p-button-sm"
              size="small"
              style={{
                fontSize: '0.875rem',
                padding: '0.5rem 1rem'
              }}
            />
          )}
          
          {/* Status/Error display */}
          <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
            {isLoading ? 'Loading players…' : isError ? (
              <Message
                severity="error"
                text={`Error: ${error || 'Unknown error'}`}
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
              />
            ) : `${filteredData.length} available`}
          </div>
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
            gap: '1rem',
            fontSize: '0.875rem',
            color: '#374151'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <Checkbox
                inputId="starred-only"
                checked={showStarredOnly}
                onChange={(e) => setShowStarredOnly(e.checked || false)}
              />
              <label htmlFor="starred-only">Show starred only</label>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <Checkbox
                inputId="hide-drafted"
                checked={hideDraftedPlayers}
                onChange={() => toggleHideDraftedPlayers()}
              />
              <label htmlFor="hide-drafted">Hide drafted players</label>
            </div>
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
          onGridReady={(params) => {
            setGridApi(params.api);
          }}
        />
      </div>

      <DraftConfigModal
        visible={showConfigModal}
        onHide={() => setShowConfigModal(false)}
      />

      <Toast ref={toast} />
    </section>
  )
}
