import React, { useState } from 'react'
import type { ICellRendererParams } from 'ag-grid-community'
import { Button } from 'primereact/button'
import type { Toast } from 'primereact/toast'
import type { Player } from '../../types'
import { useDraftStore } from '../../state/draftStore'
import { getConversationId, getUserId } from '../../lib/storage/localStore'
import { classifyError } from '../../lib/httpErrors'

export const ActionButtonsCell: React.FC<ICellRendererParams<Player> & {
  toast: React.RefObject<Toast | null>;
  onUserTurnTrigger?: () => void;
  onPlayerAction?: () => void;
  isPlayerSelected?: (playerId: string) => boolean;
  deselectPlayer?: (playerId: string) => void;
  clearAllSelections?: () => void;
}> = (params) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data, toast, onPlayerAction, isPlayerSelected, deselectPlayer, clearAllSelections } = params
  // onPlayerAction intentionally unused (interface contract)
  void onPlayerAction; // Suppress TS6133
  // onUserTurnTrigger intentionally unused (interface contract)
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
        const playerIsSelected = isPlayerSelected?.(data.id) || false
        
        setIsDrafting(true);
        try {
          draftPlayer(data.id);
          toast.current?.show({
            severity: 'success',
            summary: 'Player Drafted',
            detail: `${data.name} added to your team`,
            life: 3000
          });
          
          // Rule 5: If clicked player IS selected, clear ALL checkboxes for ALL currently selected players
          if (playerIsSelected) {
            clearAllSelections?.();
          }
          // Rule 4: If clicked player is NOT selected, do NOT affect any checkboxes
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
        const playerIsSelected = isPlayerSelected?.(data.id) || false
        
        setIsTaking(true);
        try {
          takePlayer(data.id);
          toast.current?.show({
            severity: 'info',
            summary: 'Player Taken',
            detail: `${data.name} marked as taken`,
            life: 3000
          });
          
          // Rule 3: If clicked player IS selected, clear ONLY that player's checkbox
          if (playerIsSelected) {
            deselectPlayer?.(data.id);
          }
          // Rule 2: If clicked player is NOT selected, do NOT affect any checkboxes
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
    
    const playerIsSelected = isPlayerSelected?.(data.id) || false
    
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
        
        // Rule 5: If clicked player IS selected, clear ALL checkboxes for ALL currently selected players
        if (playerIsSelected) {
          clearAllSelections?.();
        }
        // Rule 4: If clicked player is NOT selected, do NOT affect any checkboxes
        
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
      
      // Rule 5: If clicked player IS selected, clear ALL checkboxes for ALL currently selected players
      if (playerIsSelected) {
        clearAllSelections?.();
      }
      // Rule 4: If clicked player is NOT selected, do NOT affect any checkboxes
      
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
        
        // Rule 5: If clicked player IS selected, clear ALL checkboxes for ALL currently selected players
        if (playerIsSelected) {
          clearAllSelections?.();
        }
        // Rule 4: If clicked player is NOT selected, do NOT affect any checkboxes
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
    
    const playerIsSelected = isPlayerSelected?.(data.id) || false
    
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
        
        // Rule 3: If clicked player IS selected, clear ONLY that player's checkbox
        if (playerIsSelected) {
          deselectPlayer?.(data.id);
        }
        // Rule 2: If clicked player is NOT selected, do NOT affect any checkboxes
        
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
      
      // Rule 3: If clicked player IS selected, clear ONLY that player's checkbox
      if (playerIsSelected) {
        deselectPlayer?.(data.id);
      }
      // Rule 2: If clicked player is NOT selected, do NOT affect any checkboxes
      
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
        
        // Rule 3: If clicked player IS selected, clear ONLY that player's checkbox
        if (playerIsSelected) {
          deselectPlayer?.(data.id);
        }
        // Rule 2: If clicked player is NOT selected, do NOT affect any checkboxes
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