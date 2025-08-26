/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState } from 'react'
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
import { playerTakenBlocking, userDraftedBlocking, userTurnBlocking, getTextFromLlmResponse, formatApiError } from '../lib/api'
import { toMinimalPickFromAny, mapToSlimTopN } from '../lib/players/slim'
import { getConversationId, getUserId } from '../lib/storage/localStore'
import { classifyError } from '../lib/httpErrors'

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

const ActionButtonsCell: React.FC<ICellRendererParams<Player> & {
  toast: React.RefObject<Toast | null>;
  onUserTurnTrigger?: () => void;
}> = (params) => {
  const { data, toast } = params
  const [isTaking, setIsTaking] = useState(false)
  const [isDrafting, setIsDrafting] = useState(false)
  const draftPlayer = useDraftStore((s) => s.draftPlayer)
  const takePlayer = useDraftStore((s) => s.takePlayer)
  const isDrafted = useDraftStore((s) => s.isDrafted)
  const isTaken = useDraftStore((s) => s.isTaken)
  const canDraft = useDraftStore((s) => s.canDraft)
  const canTake = useDraftStore((s) => s.canTake)
  const isDraftConfigured = useDraftStore((s) => s.isDraftConfigured)
  const getCurrentPick = useDraftStore((s) => s.getCurrentPick)
  const getCurrentRound = useDraftStore((s) => s.getCurrentRound)
  const conversationId = useDraftStore((s) => s.conversationId)
  const markPlayerTaken = useDraftStore((s) => s.markPlayerTaken)
  
  // Offline mode functions
  const isOfflineMode = useDraftStore((s) => s.isOfflineMode)
  const addToQueue = useDraftStore((s) => s.addToQueue)
  const setOfflineMode = useDraftStore((s) => s.setOfflineMode)
  const actionHistory = useDraftStore((s) => s.actionHistory)
  
  if (!data) return null

  const drafted = isDrafted(data.id)
  const taken = isTaken(data.id)
  const unavailable = drafted || taken
  
  // If draft is not configured, use original behavior
  if (!isDraftConfigured()) {
    const handleDraftClick = () => {
      if (!unavailable && !isDrafting && !isTaking) {
        setIsDrafting(true);
        try {
          draftPlayer(data.id);
          toast.current?.show({
            severity: 'success',
            summary: 'Player Drafted',
            detail: `${data.name} added to your team`,
            life: 3000
          });
        } catch (error) {
          toast.current?.show({
            severity: 'error',
            summary: 'Draft Failed',
            detail: error instanceof Error ? error.message : 'Unknown error',
            life: 4000
          });
        } finally {
          setIsDrafting(false);
        }
      }
    }

    const handleTakeClick = () => {
      if (!unavailable && !isTaking && !isDrafting) {
        setIsTaking(true);
        try {
          takePlayer(data.id);
          toast.current?.show({
            severity: 'info',
            summary: 'Player Taken',
            detail: `${data.name} marked as taken`,
            life: 3000
          });
        } catch (error) {
          toast.current?.show({
            severity: 'error',
            summary: 'Mark as Taken Failed',
            detail: error instanceof Error ? error.message : 'Unknown error',
            life: 4000
          });
        } finally {
          setIsTaking(false);
        }
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
          label={drafted ? 'Drafted' : isDrafting ? 'Drafting…' : 'Draft'}
          onClick={handleDraftClick}
          disabled={unavailable || isDrafting || isTaking}
          className={unavailable || isDrafting || isTaking ? 'p-button-secondary' : 'p-button-success'}
          size="small"
          style={{
            fontSize: '0.75rem',
            padding: '0.25rem 0.5rem'
          }}
          tooltip={
            unavailable ? 'Unavailable' :
            isDrafting ? 'Processing draft...' :
            isTaking ? 'Taking player...' :
            'Add to my team'
          }
          tooltipOptions={{ position: 'top' }}
        />
        <Button
          label={isTaking ? 'Acknowledging…' : 'Taken'}
          onClick={handleTakeClick}
          disabled={unavailable || isTaking || isDrafting}
          className={unavailable || isTaking || isDrafting ? 'p-button-secondary' : 'p-button-danger'}
          size="small"
          style={{
            fontSize: '0.75rem',
            padding: '0.25rem 0.5rem'
          }}
          tooltip={
            unavailable ? 'Unavailable' :
            isTaking ? 'Processing...' :
            isDrafting ? 'Drafting player...' :
            'Mark as taken'
          }
          tooltipOptions={{ position: 'top' }}
        />
      </div>
    )
  }

  // Snake draft behavior when configured
  const canDraftThisPlayer = canDraft() && !unavailable
  const canTakeThisPlayer = canTake() && !unavailable

  const handleDraftClick = async () => {
    if (!canDraftThisPlayer || !data || isDrafting) return;
    
    setIsDrafting(true);
    
    try {
      const round = getCurrentRound();
      const pick = getCurrentPick();
      const userId = getUserId() || 'user';
      const activeConversationId = conversationId || getConversationId('draft') || localStorage.getItem('app.draft.conversationId');
      
      // If in offline mode, handle locally
      if (isOfflineMode) {
        // Execute draft action locally
        draftPlayer(data.id);
        
        // Add action to queue for later sync
        addToQueue({
          type: 'draft',
          payload: {
            playerId: data.id,
            player: data,
            round,
            pick,
            conversationId: activeConversationId || undefined,
            userId
          },
          localState: {
            playerDrafted: true,
            actionHistoryIndex: actionHistory.length
          }
        });
        
        // Show offline toast
        toast.current?.show({
          severity: 'success',
          summary: 'Player Drafted (Offline)',
          detail: `${data.name} added to your team - will sync when reconnected`,
          life: 3000
        });
        
        return;
      }
      
      // Online mode - attempt API call
      const minimal = toMinimalPickFromAny(data);
      
      if (!activeConversationId) {
        toast.current?.show({
          severity: 'error',
          summary: 'Draft Not Initialized',
          detail: 'Initialize the draft first',
          life: 3000
        });
        return;
      }
      
      // BLOCKING: Send drafted ACK
      const result = await userDraftedBlocking({
        user: userId,
        conversationId: activeConversationId,
        payload: {
          round,
          pick,
          player: minimal
        }
      });
      
      // Check for error in response
      if (result?.error) {
        const errorDetail = formatApiError(result, 'Draft failed')
        toast.current?.show({
          severity: 'error',
          summary: 'Draft Failed',
          detail: errorDetail,
          life: 4000
        });
        return;
      }
      
      // On success: update roster locally
      draftPlayer(data.id);
      
      // Show ACK message if returned (DRAFTED:...)
      const ack = getTextFromLlmResponse(result) || result?.message || result?.data?.message || '';
      if (ack && ack.startsWith('DRAFTED:')) {
        toast.current?.show({
          severity: 'success',
          summary: ack,
          life: 3000
        });
      }
      
    } catch (error) {
      console.error('Draft API error:', error);
      
      // Check if this is an offline-worthy error
      const classification = classifyError(error);
      if (classification.offlineWorthy) {
        // Switch to offline mode and retry the action
        setOfflineMode(true);
        
        toast.current?.show({
          severity: 'warn',
          summary: 'Connection Lost',
          detail: 'Switched to offline mode - continuing draft offline',
          life: 3000
        });
        
        // Retry as offline action
        const round = getCurrentRound();
        const pick = getCurrentPick();
        const userId = getUserId() || 'user';
        const activeConversationId = conversationId || getConversationId('draft') || localStorage.getItem('app.draft.conversationId');
        
        draftPlayer(data.id);
        addToQueue({
          type: 'draft',
          payload: {
            playerId: data.id,
            player: data,
            round,
            pick,
            conversationId: activeConversationId || undefined,
            userId
          },
          localState: {
            playerDrafted: true,
            actionHistoryIndex: actionHistory.length
          }
        });
        
        toast.current?.show({
          severity: 'success',
          summary: 'Player Drafted (Offline)',
          detail: `${data.name} added to your team - will sync when reconnected`,
          life: 3000
        });
      } else {
        toast.current?.show({
          severity: 'error',
          summary: 'API Error',
          detail: error instanceof Error ? error.message : 'Unknown error',
          life: 4000
        });
      }
    } finally {
      setIsDrafting(false);
    }
  }

  const handleTakeClick = async () => {
    if (isTaking || !canTakeThisPlayer || !data) return;
    
    setIsTaking(true);
    
    try {
      const round = getCurrentRound();
      const pick = getCurrentPick();
      const userId = getUserId() || 'user';
      const activeConversationId = conversationId || getConversationId('draft') || localStorage.getItem('app.draft.conversationId');
      
      // If in offline mode, handle locally
      if (isOfflineMode) {
        // Execute taken action locally
        markPlayerTaken(data.id, data, 'Player marked as taken (offline)', activeConversationId || undefined);
        
        // Add action to queue for later sync
        addToQueue({
          type: 'taken',
          payload: {
            playerId: data.id,
            player: data,
            round,
            pick,
            conversationId: activeConversationId || undefined,
            userId
          },
          localState: {
            playerTaken: true,
            actionHistoryIndex: actionHistory.length
          }
        });
        
        // Show offline toast
        toast.current?.show({
          severity: 'info',
          summary: 'Player Marked as Taken (Offline)',
          detail: `${data.name} marked as taken - will sync when reconnected`,
          life: 3000
        });
        
        return;
      }
      
      // Online mode - attempt API call
      const minimal = toMinimalPickFromAny(data);
      
      if (!activeConversationId) {
        toast.current?.show({
          severity: 'error',
          summary: 'Draft Not Initialized',
          detail: 'Initialize the draft first',
          life: 3000
        });
        return;
      }
      
      // BLOCKING: Send taken ACK
      const result = await playerTakenBlocking({
        user: userId,
        conversationId: activeConversationId,
        payload: { round, pick, player: minimal }
      });
      
      // Check for error in response
      if (result?.error) {
        // Special handling for 409 invalid_conversation - session expired
        if (result.error.code === 409 && result.error.message?.includes('invalid_conversation')) {
          // Clear conversation ID from localStorage
          localStorage.removeItem('app.draft.conversationId');
          
          // Reset draft to trigger config modal
          const resetDraft = useDraftStore.getState().resetDraft;
          resetDraft();
          
          toast.current?.show({
            severity: 'warn',
            summary: 'Session Expired',
            detail: 'Please re-initialize your draft.',
            life: 5000
          });
          return;
        }
        
        // Handle other errors normally
        const errorDetail = formatApiError(result, 'Mark as taken failed')
        toast.current?.show({
          severity: 'error',
          summary: 'Mark as Taken Failed',
          detail: errorDetail,
          life: 4000
        });
        return;
      }
      
      // On success: update store to mark player as taken
      const ack = getTextFromLlmResponse(result) || result?.message || result?.data?.message || '';
      markPlayerTaken(data.id, data, ack || 'Player taken recorded', activeConversationId);
      
      // Show ACK message (TAKEN:...)
      if (ack && ack.startsWith('TAKEN:')) {
        toast.current?.show({
          severity: 'info',
          summary: ack,
          life: 3000
        });
      }
      
    } catch (error) {
      console.error('Take API error:', error);
      
      // Check if this is an offline-worthy error
      const classification = classifyError(error);
      if (classification.offlineWorthy) {
        // Switch to offline mode and retry the action
        setOfflineMode(true);
        
        toast.current?.show({
          severity: 'warn',
          summary: 'Connection Lost',
          detail: 'Switched to offline mode - continuing draft offline',
          life: 3000
        });
        
        // Retry as offline action
        const round = getCurrentRound();
        const pick = getCurrentPick();
        const userId = getUserId() || 'user';
        const activeConversationId = conversationId || getConversationId('draft') || localStorage.getItem('app.draft.conversationId');
        
        markPlayerTaken(data.id, data, 'Player marked as taken (offline)', activeConversationId || undefined);
        addToQueue({
          type: 'taken',
          payload: {
            playerId: data.id,
            player: data,
            round,
            pick,
            conversationId: activeConversationId || undefined,
            userId
          },
          localState: {
            playerTaken: true,
            actionHistoryIndex: actionHistory.length
          }
        });
        
        toast.current?.show({
          severity: 'info',
          summary: 'Player Marked as Taken (Offline)',
          detail: `${data.name} marked as taken - will sync when reconnected`,
          life: 3000
        });
      } else {
        toast.current?.show({
          severity: 'error',
          summary: 'API Error',
          detail: error instanceof Error ? error.message : 'Unknown error',
          life: 4000
        });
      }
    } finally {
      setIsTaking(false);
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
        label={drafted ? 'Drafted' : isDrafting ? 'Drafting…' : isOfflineMode ? 'Draft (Offline)' : 'Draft'}
        onClick={handleDraftClick}
        disabled={!canDraftThisPlayer || isDrafting || isTaking}
        className={!canDraftThisPlayer || isDrafting || isTaking ? 'p-button-secondary' : 'p-button-success'}
        size="small"
        style={{
          fontSize: '0.75rem',
          padding: '0.25rem 0.5rem'
        }}
        tooltip={
          unavailable ? 'Unavailable' :
          !canDraft() ? 'Not your turn' :
          isDrafting ? 'Processing draft...' :
          isTaking ? 'Taking player...' :
          isOfflineMode ? 'Add to my team (will sync when reconnected)' :
          'Add to my team'
        }
        tooltipOptions={{ position: 'top' }}
      />
      
      <Button
        label={isTaking ? 'Acknowledging…' : isOfflineMode ? 'Taken (Offline)' : 'Taken'}
        onClick={handleTakeClick}
        disabled={!canTakeThisPlayer || isTaking || isDrafting}
        className={!canTakeThisPlayer || isTaking || isDrafting ? 'p-button-secondary' : 'p-button-danger'}
        size="small"
        style={{
          fontSize: '0.75rem',
          padding: '0.25rem 0.5rem'
        }}
        tooltip={
          unavailable ? 'Unavailable' :
          !canTake() ? 'Your turn to draft' :
          isTaking ? 'Processing...' :
          isDrafting ? 'Drafting player...' :
          isOfflineMode ? 'Mark as taken (will sync when reconnected)' :
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

interface PlayersGridProps {
  toast: React.RefObject<Toast | null>
}

export const PlayersGrid: React.FC<PlayersGridProps> = ({ toast }) => {
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
  const lastTurnKeyRef = React.useRef<string | null>(null) // Guard against wheel double-calls
  const draftConfig = useDraftStore((s) => s.draftConfig)
  const isDraftConfigured = useDraftStore((s) => s.isDraftConfigured)
  const hideDraftedPlayers = useDraftStore((s) => s.hideDraftedPlayers)
  const toggleHideDraftedPlayers = useDraftStore((s) => s.toggleHideDraftedPlayers)
  
  // Additional selectors for user-turn payload
  const getCurrentRound = useDraftStore((s) => s.getCurrentRound)
  const getCurrentPick = useDraftStore((s) => s.getCurrentPick)
  const myTeam = useDraftStore((s) => s.myTeam)
  const players = useDraftStore((s) => s.players)
  const addConversationMessage = useDraftStore((s) => s.addConversationMessage)
  const conversationId = useDraftStore((s) => s.conversationId)
  

  // Task 5: User turn trigger with wheel guard - wrapped with useCallback to prevent unnecessary re-renders
  const tryTriggerUserTurnEdgeGuarded = React.useCallback(async () => {
    const round = getCurrentRound();
    const pick = getCurrentPick();
    const turnKey = `${round}:${pick}`;
    
    // Wheel guard: skip if same turn key
    if (turnKey === lastTurnKeyRef.current) {
      console.debug('User-turn analysis already triggered for', turnKey);
      return;
    }
    
    const activeConversationId = conversationId || getConversationId('draft');
    
    // Guard: conversationId must exist
    if (!activeConversationId) {
      console.debug('No conversationId, skipping user-turn analysis');
      return;
    }
    
    // Guard: must be configured
    if (!isDraftConfigured()) {
      console.debug('Draft not configured, skipping user-turn analysis');
      return;
    }
    
    const userId = getUserId() || 'user';
    const numTeams = draftConfig.teams || 6;
    const slot = draftConfig.pick || 1;
    
    try {
      // Show loading indicator
      toast.current?.show({
        severity: 'info',
        summary: 'Getting recommendations...',
        detail: 'AI is analyzing your turn',
        life: 0 // Keep until response
      });
      
      // Build current roster as slim players
      const slimRoster = players
        .filter(p => myTeam[p.id])
        .map(p => toMinimalPickFromAny(p));
      
      // Get available players (top 25) using mapToSlimTopN
      const availablePlayers = players.filter(p => !isDrafted(p.id) && !isTaken(p.id));
      const availablePlayers25 = mapToSlimTopN(availablePlayers, 25);
      
      console.debug('Triggering user-turn analysis for', turnKey);
      
      const result = await userTurnBlocking({
        user: userId,
        conversationId: activeConversationId,
        payload: {
          round,
          pick,
          userRoster: slimRoster,
          availablePlayers: availablePlayers25,
          leagueSize: numTeams,
          pickSlot: slot
        }
      });
      
      // Clear loading toast
      toast.current?.clear();
      
      // Check for error in response
      if (result?.error) {
        // Special handling for 409 invalid_conversation - session expired
        if (result.error.code === 409 && result.error.message?.includes('invalid_conversation')) {
          // Clear conversation ID from localStorage
          localStorage.removeItem('app.draft.conversationId');
          
          // Reset draft to trigger config modal
          const resetDraft = useDraftStore.getState().resetDraft;
          resetDraft();
          
          toast.current?.show({
            severity: 'warn',
            summary: 'Session Expired',
            detail: 'Please re-initialize your draft.',
            life: 5000
          });
          return;
        }
        
        // Handle other errors normally (offline detection already handled by withOfflineDetection)
        const errorDetail = formatApiError(result, 'Analysis failed')
        toast.current?.show({
          severity: 'error',
          summary: 'Analysis Failed',
          detail: errorDetail,
          life: 4000
        });
        return;
      }
      
      // Normalize text via getTextFromLlmResponse
      const text = getTextFromLlmResponse(result);
      
      // Push a message as 'analysis' type with meta
      addConversationMessage({
        id: `user-turn-analysis-${Date.now()}`,
        type: 'analysis',
        content: text,
        timestamp: Date.now(),
        meta: { round, pick }
      });
      
      // Update wheel guard on success
      lastTurnKeyRef.current = turnKey;
      
      toast.current?.show({
        severity: 'success',
        summary: 'Recommendations ready',
        detail: 'Check the analysis drawer for insights',
        life: 3000
      });
      
    } catch (error) {
      console.error('User-turn analysis failed:', error);
      
      // Clear loading toast
      toast.current?.clear();
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.current?.show({
        severity: 'error',
        summary: 'Analysis failed',
        detail: errorMessage,
        life: 4000
      });
    }
  }, [getCurrentRound, getCurrentPick, conversationId, isDraftConfigured, draftConfig.teams, draftConfig.pick, players, myTeam, isDrafted, isTaken, addConversationMessage, toast])

  // Handle round change animation
  React.useEffect(() => {
    if (currentRound !== prevRound) {
      setAnimateRound(true)
      setPrevRound(currentRound)
      const timer = setTimeout(() => setAnimateRound(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [currentRound, prevRound])

  // Get reactive values from Zustand store to prevent infinite loops
  const currentIsMyTurn = useDraftStore((s) => s.isMyTurn())
  const currentPicksUntilTurn = useDraftStore((s) => s.getPicksUntilMyTurn())

  // Task 5: Turn detection effect with edge transition monitoring
  React.useEffect(() => {
    if (!isDraftConfigured()) return

    // Show "You're up next" toast when exactly 1 pick until my turn
    if (currentPicksUntilTurn === 1 && prevPicksUntilTurn !== 1) {
      toast.current?.show({
        severity: 'warn',
        summary: "You're up next!",
        life: 0, // Keep until dismissed
        className: 'top-right-toast'
      })
    }

    // Detect edge transition: prevIsMyTurn === false && currentIsMyTurn === true
    if (prevIsMyTurn === false && currentIsMyTurn === true) {
      // Clear any existing "up next" toast
      toast.current?.clear()
      
      toast.current?.show({
        severity: 'success',
        summary: "It's your turn!",
        life: 0, // Keep until I draft
        className: 'top-right-toast'
      })
      
      // Trigger user-turn analysis with wheel guard
      tryTriggerUserTurnEdgeGuarded();
    }

    // Clear turn toasts when I've drafted (no longer my turn after drafting)
    if (!currentIsMyTurn && prevIsMyTurn) {
      toast.current?.clear()
    }

    setPrevIsMyTurn(currentIsMyTurn)
    setPrevPicksUntilTurn(currentPicksUntilTurn)
  }, [currentIsMyTurn, currentPicksUntilTurn, prevIsMyTurn, prevPicksUntilTurn, isDraftConfigured, tryTriggerUserTurnEdgeGuarded])

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
      cellRenderer: (params: ICellRendererParams<Player>) => <ActionButtonsCell {...params} toast={toast} onUserTurnTrigger={tryTriggerUserTurnEdgeGuarded} />,
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
        toast={toast}
      />

    </section>
  )
}
