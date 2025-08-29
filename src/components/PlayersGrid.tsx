import React, { useRef, useState, useEffect, useCallback } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, ICellRendererParams, SelectionChangedEvent, IRowNode } from 'ag-grid-community'
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
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { getConversationId, getUserId } from '../lib/storage/localStore'
import { classifyError } from '../lib/httpErrors'
import { createPortal } from 'react-dom'
import { analyzeBlocking } from '../lib/api'
import { toSlimPlayer } from '../lib/players/slim'

type InfoIconTooltipProps = {
  reason?: string
  delayMs?: number
}

export const InfoIconTooltip: React.FC<InfoIconTooltipProps> = ({ reason, delayMs = 1000 }) => {
  const enabled = !!reason

  const anchorRef = useRef<HTMLSpanElement | null>(null)
  const timerRef = useRef<number | null>(null)

  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ left: number; top: number }>({ left: 0, top: 0 })

  const positionTooltip = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setCoords({ left: rect.left + rect.width / 2, top: rect.bottom + 8 })
  }, [])

  const onEnter = () => {
    if (!enabled) return
    if (timerRef.current) window.clearTimeout(timerRef.current)
    positionTooltip()
    timerRef.current = window.setTimeout(() => setOpen(true), delayMs)
  }

  const onLeave = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setOpen(false)
  }

  // Hook is called unconditionally; it guards internally
  useEffect(() => {
    if (!open) return
    const onReflow = () => positionTooltip()
    window.addEventListener('scroll', onReflow, true)
    window.addEventListener('resize', onReflow)
    return () => {
      window.removeEventListener('scroll', onReflow, true)
      window.removeEventListener('resize', onReflow)
    }
  }, [open, positionTooltip])

  // Only decide what to render AFTER hooks have been called
  if (!enabled) return null

  return (
    <>
      <span
        ref={anchorRef}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '0.5rem' }}
      >
        <FontAwesomeIcon
          icon="info-circle"
          className="cursor-help"
          style={{ width: 16, height: 16, color: '#3D82F6' }}
          aria-label={reason}
        />
      </span>

      {open &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform: 'translateX(-50%)',
              backgroundColor: '#1f2937',
              color: '#fff',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              maxWidth: 300,
              whiteSpace: 'normal',
              zIndex: 100000,
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
              pointerEvents: 'none',
            }}
          >
            {reason}
            <div
              style={{
                position: 'absolute',
                top: -4,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderBottom: '4px solid #1f2937',
              }}
            />
          </div>,
          document.body
        )}
    </>
  )
}

// Name with Info Icon Cell
const NameWithInfoCell: React.FC<ICellRendererParams<Player>> = ({ data }) => {
  if (!data) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <span>{data.name}</span>
      <InfoIconTooltip reason={data.reason} />
    </div>
  )
}

// Simple ID Cell (replaces StarCell)
const IdCell: React.FC<ICellRendererParams<Player>> = ({ data }) => {
  if (!data) return null
  return <span>{data.id}</span>
}

const ActionButtonsCell: React.FC<ICellRendererParams<Player> & {
  toast: React.RefObject<Toast | null>;
  onUserTurnTrigger?: () => void;
  onPlayerAction?: () => void;
}> = (params) => {
  const { data, toast, onPlayerAction } = params
  const [isTaking, setIsTaking] = useState(false)
  const [isDrafting, setIsDrafting] = useState(false)
  const [watchingPlayers, setWatchingPlayers] = useState<Set<string>>(new Set())
  
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
  const isWatching = watchingPlayers.has(data.id)
  
  const handleWatchClick = () => {
    setWatchingPlayers(prev => {
      const newSet = new Set(prev)
      if (newSet.has(data.id)) {
        newSet.delete(data.id)
      } else {
        newSet.add(data.id)
      }
      return newSet
    })
  }
  
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
          // Clear selections after drafting
          onPlayerAction?.();
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
          // Clear selections after marking as taken
          onPlayerAction?.();
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
            padding: '0.25rem 0.5rem',
            color: '#F1F5F9'
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
          label="Taken"
          onClick={handleTakeClick}
          disabled={unavailable || isTaking || isDrafting}
          className={unavailable || isTaking || isDrafting ? 'p-button-secondary' : 'p-button-danger'}
          size="small"
          style={{
            fontSize: '0.75rem',
            padding: '0.25rem 0.5rem',
            color: '#F1F5F9'
          }}
          tooltip={
            unavailable ? 'Unavailable' :
            isTaking ? 'Processing...' :
            isDrafting ? 'Drafting player...' :
            'Mark as taken'
          }
          tooltipOptions={{ position: 'top' }}
        />
        <Button
          label={isWatching ? 'Watching' : 'Watch'}
          onClick={handleWatchClick}
          className={isWatching ? 'p-button-secondary' : 'p-button-warning'}
          size="small"
          style={{
            fontSize: '0.75rem',
            padding: '0.25rem 0.5rem',
            color: '#F1F5F9'
          }}
          tooltip={isWatching ? 'Stop watching this player' : 'Watch this player'}
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
      // const minimal = toMinimalPickFromAny(data);
      
      if (!activeConversationId) {
        toast.current?.show({
          severity: 'error',
          summary: 'Draft Not Initialized',
          detail: 'Initialize the draft first',
          life: 3000
        });
        return;
      }
      
      // Local-only operation: update roster locally
      draftPlayer(data.id);
      
      // Show success message
      toast.current?.show({
        severity: 'success',
        summary: 'Player Drafted',
        detail: `${data.name} added to your team`,
        life: 3000
      });
      
      // Clear selections after drafting
      onPlayerAction?.();
      
      // Trigger analyze call if it's now the user's turn
      // Note: Analyze triggering will be handled by existing turn detection logic
      
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
        
        // Clear selections after drafting
        onPlayerAction?.();
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
      // const minimal = toMinimalPickFromAny(data);
      
      if (!activeConversationId) {
        toast.current?.show({
          severity: 'error',
          summary: 'Draft Not Initialized',
          detail: 'Initialize the draft first',
          life: 3000
        });
        return;
      }
      
      // Local-only operation: update store to mark player as taken
      takePlayer(data.id);
      
      // Show success message
      toast.current?.show({
        severity: 'info',
        summary: 'Player Taken',
        detail: `${data.name} marked as taken`,
        life: 3000
      });
      
      // Clear selections after marking as taken
      onPlayerAction?.();
      
      // Trigger analyze call if it's now the user's turn
      // Note: Analyze triggering will be handled by existing turn detection logic
      
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
        
        // Clear selections after marking as taken
        onPlayerAction?.();
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
          padding: '0.25rem 0.5rem',
          color: '#F1F5F9'
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
          padding: '0.25rem 0.5rem',
          color: '#F1F5F9'
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
      
      <Button
        label={isWatching ? 'Watching' : 'Watch'}
        onClick={handleWatchClick}
        disabled={unavailable}
        className={unavailable ? 'p-button-secondary' : (isWatching ? 'p-button-secondary' : 'p-button-warning')}
        size="small"
        style={{
          fontSize: '0.75rem',
          padding: '0.25rem 0.5rem',
          color: '#F1F5F9'
        }}
        tooltip={unavailable ? 'Player is drafted/taken' : (isWatching ? 'Stop watching this player' : 'Watch this player')}
        tooltipOptions={{ position: 'top' }}
      />
    </div>
  )
}

const OverallRankCell: React.FC<ICellRendererParams<Player>> = ({ data }) => {
  if (!data) return null

  const newRank = data.newOverallRank ?? null
  const prevRank = data.previousOverallRank ?? null

  if (newRank == null) return null // or show '-' if you prefer

  // Only show delta if we have a previous rank
  const hasPrev = typeof prevRank === 'number'
  const diff = hasPrev ? (prevRank! - newRank) : 0 // + = improved, - = worse
  const color =
    diff > 0 ? '#22c55e' : diff < 0 ? '#ef4444' : '#eab308'

  // Format to ensure (0) rather than (+0)
  const formatted = hasPrev
    ? (diff === 0 ? '0' : diff > 0 ? `+${diff}` : `${diff}`)
    : ''

  return (
    <div className="flex items-center gap-1">
      <span style={{ marginRight: 3 }}>{newRank}</span>
      {hasPrev && (
        <span style={{ color, display: 'flex' }}>
          ({formatted})
        </span>
      )}
    </div>
  )
}

const PositionRankCell: React.FC<ICellRendererParams<Player>> = ({ data }) => {
  if (!data) return null

  const newRank = data.newPositionRank ?? null
  const prevRank = data.previousPositionRank ?? null

  // If we don't even have a new rank, show nothing (or return a dash)
  if (newRank == null) return null

  const hasPrev = prevRank != null
  const diff = hasPrev ? (prevRank! - newRank) : 0 // + = improved, - = worse
  const color =
    diff > 0 ? '#22c55e' : diff < 0 ? '#ef4444' : '#eab308'

  // Format to ensure (0) rather than (+0)
  const formatted = hasPrev
    ? (diff === 0 ? '0' : diff > 0 ? `+${diff}` : `${diff}`)
    : ''

  return (
    <div className="flex items-center gap-1">
      <span style={{ marginRight: 3 }}>{newRank}</span>
      {hasPrev && (
        <span style={{ color, display: 'flex' }}>
          ({formatted})
        </span>
      )}
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showStarredOnly, setShowStarredOnly] = React.useState(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [animateRound, setAnimateRound] = React.useState(false)
  const [prevRound, setPrevRound] = React.useState(currentRound)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [gridApi, setGridApi] = React.useState<any>(null)
  const [showConfigModal, setShowConfigModal] = React.useState(false)
  const [prevIsMyTurn, setPrevIsMyTurn] = React.useState(false)
  const [prevPicksUntilTurn, setPrevPicksUntilTurn] = React.useState(0)
  const [hidingPlayerIds, setHidingPlayerIds] = React.useState<Set<string>>(new Set())
  const [selectedPlayers, setSelectedPlayers] = React.useState<Player[]>([])
  const [isAnalyzing, setIsAnalyzing] = React.useState(false)
  const [analysisComplete, setAnalysisComplete] = React.useState(false)
  const [lastAnalyzedPlayerIds, setLastAnalyzedPlayerIds] = React.useState<string[]>([])
  const draftConfig = useDraftStore((s) => s.draftConfig)
  const isDraftConfigured = useDraftStore((s) => s.isDraftConfigured)
  const hideDraftedPlayers = useDraftStore((s) => s.hideDraftedPlayers)
  const toggleHideDraftedPlayers = useDraftStore((s) => s.toggleHideDraftedPlayers)
  const addConversationMessage = useDraftStore((s) => s.addConversationMessage)
  
  // Selectors for turn detection
  const getCurrentRound = useDraftStore((s) => s.getCurrentRound)
  const getCurrentPick = useDraftStore((s) => s.getCurrentPick)
  

  // NOTE: Automatic user turn analysis function removed. Manual AI Assistant still available via Header button.

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
      
      // NOTE: Automatic AI analysis removed - manual AI Assistant button still available
    }

    // Clear turn toasts when I've drafted (no longer my turn after drafting)
    if (!currentIsMyTurn && prevIsMyTurn) {
      toast.current?.clear()
    }

    setPrevIsMyTurn(currentIsMyTurn)
    setPrevPicksUntilTurn(currentPicksUntilTurn)
  }, [currentIsMyTurn, currentPicksUntilTurn, prevIsMyTurn, prevPicksUntilTurn, isDraftConfigured, toast])

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
      
      if (showStarredOnly && !isStarred(p.id)) return false
      return true
    })
  }, [data, isStarred, showStarredOnly, hideDraftedPlayers, hidingPlayerIds])

  const colDefs = React.useMemo<ColDef<Player>[]>(() => [
    {
      headerName: '',
      width: 50,
      checkboxSelection: true,
      headerCheckboxSelection: true,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      pinned: 'left',
      checkboxSelectionCallback: (params: { data: Player | null }) => {
        // Disable checkbox if player is drafted or taken
        const playerId = params.data?.id;
        if (!playerId) return false;
        return !isDrafted(playerId) && !isTaken(playerId);
      }
    },
    { headerName: '#', width: 70, cellRenderer: IdCell, suppressHeaderMenuButton: true, sortable: false, filter: false },
    { headerName: 'Name', field: 'name', flex: 1, minWidth: 180, filter: true, cellRenderer: NameWithInfoCell },
    { headerName: 'Pos', field: 'position', width: 90, filter: true },
    { headerName: 'Team', field: 'team.abbr', width: 90, filter: true, cellRenderer: TeamLogoCell },
    { headerName: 'Ovr Rank', field: 'newOverallRank', width: 110, filter: 'agNumberColumnFilter', cellRenderer: OverallRankCell },
    { headerName: 'Pos Rank', field: 'newPositionRank', width: 110, filter: 'agNumberColumnFilter', cellRenderer: PositionRankCell },
    { headerName: 'Exp Rd', field: 'expectedRound', width: 100, filter: 'agNumberColumnFilter' },
    { headerName: 'Bye', field: 'byeWeek', width: 90, filter: 'agNumberColumnFilter' },
    { headerName: 'Yrs', field: 'yearsPro', width: 90, filter: 'agNumberColumnFilter' },
    { headerName: 'Comp', field: 'competitionLevel', width: 120, filter: true },
    {
      headerName: 'Actions',
      width: 200,
      cellRenderer: (params: ICellRendererParams<Player>) => <ActionButtonsCell {...params} toast={toast} onPlayerAction={clearSelections} />,
      sortable: false,
      filter: false,
      suppressHeaderMenuButton: true,
      pinned: 'right'
    },
  ], [toast, isDrafted, isTaken])

  // Handle selection changes
  const handleSelectionChanged = React.useCallback((event: SelectionChangedEvent) => {
    const selectedNodes = event.api.getSelectedNodes()
    const selectedData = selectedNodes.map((node: IRowNode) => node.data).filter((data): data is Player => data != null)
    setSelectedPlayers(selectedData)
    
    // Reset analysis complete state when selections change after analysis
    if (analysisComplete && selectedData.length > 0) {
      const currentPlayerIds = selectedData.map(p => p.id).sort()
      const lastPlayerIds = lastAnalyzedPlayerIds.sort()
      const hasChanged = currentPlayerIds.length !== lastPlayerIds.length ||
                        currentPlayerIds.some((id, index) => id !== lastPlayerIds[index])
      if (hasChanged) {
        setAnalysisComplete(false)
      }
    }
  }, [analysisComplete, lastAnalyzedPlayerIds])

  // Generate dynamic button text based on selection and state
  const getAnalyzeButtonText = React.useCallback(() => {
    const count = selectedPlayers.length
    
    if (isAnalyzing) {
      return count === 0 ? 'Analyzing 25 Players' : `Analyzing ${count} Players`
    }
    
    if (analysisComplete) {
      return count === 0 ? 'Analysis Complete for 25 Players' : `Analysis Complete for ${count} Players`
    }
    
    if (count === 0) {
      return 'Analyze Top 25 Players'
    } else if (count === 1) {
      return 'Select At Least 2 Players'
    } else {
      return `Analyze ${count} Selected Players`
    }
  }, [selectedPlayers.length, isAnalyzing, analysisComplete])

  // Check if analyze button should be disabled
  const isAnalyzeButtonDisabled = React.useCallback(() => {
    return selectedPlayers.length === 1 || isAnalyzing || (analysisComplete && !hasSelectionsChangedAfterAnalysis())
  }, [selectedPlayers.length, isAnalyzing, analysisComplete])
  
  // Check if selections have changed after analysis
  const hasSelectionsChangedAfterAnalysis = React.useCallback(() => {
    if (!analysisComplete) return false
    const currentPlayerIds = selectedPlayers.map(p => p.id).sort()
    const lastPlayerIds = lastAnalyzedPlayerIds.sort()
    return currentPlayerIds.length !== lastPlayerIds.length ||
           currentPlayerIds.some((id, index) => id !== lastPlayerIds[index])
  }, [selectedPlayers, lastAnalyzedPlayerIds, analysisComplete])

  // Function to clear all selections
  const clearSelections = React.useCallback(() => {
    if (gridApi) {
      gridApi.deselectAll()
      setSelectedPlayers([])
      // Reset analysis state when selections are cleared
      setAnalysisComplete(false)
      setLastAnalyzedPlayerIds([])
    }
  }, [gridApi])

  // Handle analyze button click
  const handleAnalyzeClick = React.useCallback(async () => {
    if (isAnalyzing) return
    
    setIsAnalyzing(true)
    setAnalysisComplete(false)
    
    try {
      // Determine which players to analyze
      const playersToAnalyze = selectedPlayers.length >= 2 ? selectedPlayers : filteredData.slice(0, 25)
      const currentRound = getCurrentRound()
      const currentPick = getCurrentPick()
      const conversationId = useDraftStore.getState().conversationId || getConversationId('draft') || localStorage.getItem('app.draft.conversationId')
      
      if (!conversationId) {
        toast.current?.show({
          severity: 'error',
          summary: 'Analysis Failed',
          detail: 'Draft conversation not initialized',
          life: 4000
        })
        return
      }
      
      // Get current roster (drafted players)
      const roster = data?.filter(p => isDrafted(p.id)) || []
      
      // Get available players (not drafted and not taken)
      const availablePlayers = playersToAnalyze.filter(p => !isDrafted(p.id) && !isTaken(p.id))
      
      // Convert to SlimPlayer format
      const rosterSlim = roster.map(toSlimPlayer)
      const availableSlim = availablePlayers.map(toSlimPlayer)
      
      // Create payload
      const payload = {
        conversationId,
        round: currentRound || 1,
        pick: currentPick || 1,
        roster: rosterSlim,
        availablePlayers: availableSlim,
        leagueSize: draftConfig.teams || 12,
        pickSlot: draftConfig.pick || 1
      }
      
      // Log full payload before API call
      console.log('🚀 [ANALYZE] Full payload before API call:', payload)
      
      const response = await analyzeBlocking(payload)
      
      // Log when response returns
      console.log('✅ [ANALYZE] Response received:', response)
      
      if (response?.error) {
        toast.current?.show({
          severity: 'error',
          summary: 'Analysis Failed',
          detail: response.error.message || 'Analysis request failed',
          life: 4000
        })
      } else {
        // Analysis completed successfully
        setAnalysisComplete(true)
        setLastAnalyzedPlayerIds(playersToAnalyze.map(p => p.id))
        
        // Add the analysis result to conversation messages
        const analysisContent = response?.content || response?.answer || response?.data?.content || response?.data?.answer || 'Analysis completed successfully'
        
        addConversationMessage({
          id: Date.now().toString(),
          type: 'analysis',
          content: analysisContent,
          timestamp: Date.now(),
          round: currentRound || 1,
          pick: currentPick || 1,
          meta: {
            round: currentRound || 1,
            pick: currentPick || 1,
            playerCount: playersToAnalyze.length
          }
        })
        
        toast.current?.show({
          severity: 'success',
          summary: 'Analysis Complete',
          detail: `Successfully analyzed ${playersToAnalyze.length} players`,
          life: 3000
        })
      }
      
    } catch (error) {
      console.error('Analysis error:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Analysis Failed',
        detail: error instanceof Error ? error.message : 'Unknown error occurred',
        life: 4000
      })
    } finally {
      setIsAnalyzing(false)
    }
  }, [isAnalyzing, selectedPlayers, filteredData, getCurrentRound, getCurrentPick, data, draftConfig.teams, draftConfig.pick, toast, isDrafted, isTaken, addConversationMessage])

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

          {/* Current Pick Indicator */}
          <div
            style={{
              backgroundColor: '#f1f5f9',
              borderColor: '#cbd5e1',
              border: '1px solid',
              borderRadius: '0.375rem',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: '#475569',
              marginLeft: '0.5rem'
            }}
            aria-label="Current draft pick information"
          >
            {(() => {
              const overallPick = getCurrentPick();
              const round = getCurrentRound();
              const teams = draftConfig.teams;
              
              if (teams && overallPick && round) {
                const pickInRound = ((overallPick - 1) % teams) + 1;
                return `Round #${round} - Pick #${pickInRound} (#${overallPick} Overall)`;
              } else {
                return 'Round #— | Overall #—';
              }
            })()}
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
                {draftConfig.teams} Teams; Pick #{draftConfig.pick}
              </div>
              {/* <Button
                label="Update Setup"
                onClick={() => setShowConfigModal(true)}
                className="p-button-outlined p-button-sm"
                size="small"
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem'
                }}
              /> */}
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
            ) : null}
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
            gap: '0.5rem',
            fontSize: '0.875rem',
            color: '#374151'
          }}>
            {/* <div style={{
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
            </div> */}
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
          {/* Analyze Button - moved to same row */}
          <Button
            label={getAnalyzeButtonText()}
            icon={isAnalyzing ? "pi pi-spin pi-spinner" : "pi pi-chart-line"}
            onClick={handleAnalyzeClick}
            disabled={isAnalyzeButtonDisabled()}
            className={isAnalyzeButtonDisabled() ? "p-button-secondary" : (analysisComplete ? "p-button-success" : "p-button-primary")}
            style={{
              backgroundColor: isAnalyzeButtonDisabled() ? '#6b7280' : (analysisComplete ? '#22c55e' : '#3b82f6'),
              borderColor: isAnalyzeButtonDisabled() ? '#6b7280' : (analysisComplete ? '#22c55e' : '#3b82f6'),
              color: '#ffffff',
              fontSize: '0.875rem',
              padding: '0.5rem 1rem',
              fontWeight: '600'
            }}
            tooltip={
              isAnalyzing ? "Analysis in progress..." :
              analysisComplete ? "Analysis completed successfully" :
              isAnalyzeButtonDisabled() ? "Select at least 2 players to analyze" :
              "Analyze selected players or top 25 if none selected"
            }
            tooltipOptions={{ position: 'top' }}
          />
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
          rowSelection="multiple"
          isRowSelectable={(rowNode) => {
            return rowNode.data ? !isDrafted(rowNode.data.id) && !isTaken(rowNode.data.id) : false;
          }}
          onSelectionChanged={handleSelectionChanged}
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
