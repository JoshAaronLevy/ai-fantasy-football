/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react'
import { Dialog } from 'primereact/dialog'
import { Dropdown } from 'primereact/dropdown'
import { Button } from 'primereact/button'
import { Message } from 'primereact/message'
import { Toast } from 'primereact/toast'
import { useDraftStore } from '../state/draftStore'
import { useLlmStream } from '../hooks/useLlmStream'
import { getUserId } from '../lib/storage/localStore'

interface DraftConfigModalProps {
  visible: boolean;
  onHide: () => void;
  onDraftInitialized?: () => void;
  toast: React.RefObject<Toast>;
}

export const DraftConfigModal: React.FC<DraftConfigModalProps> = ({ visible, onHide, onDraftInitialized, toast }) => {
  const {
    draftConfig,
    players,
    initializeDraftState,
    isDrafted,
    isTaken,
    isOfflineMode,
    setOfflineMode,
    setShowOfflineBanner,
    addPendingApiCall,
    initializeDraftOffline
  } = useDraftStore()
  
  const [selectedTeams, setSelectedTeams] = React.useState<number | null>(draftConfig.teams)
  const [selectedPick, setSelectedPick] = React.useState<number | null>(draftConfig.pick)
  const [error, setError] = React.useState<string | null>(null)
  
  // Streaming hook for initialize
  const [{ tokens, error: streamError, isStreaming, conversationId, lastEvent }, { start: startStream, abort: abortStream, clear: clearStream }] = useLlmStream()

  // Reset form when modal opens with current config
  React.useEffect(() => {
    if (visible) {
      setSelectedTeams(draftConfig.teams)
      setSelectedPick(draftConfig.pick)
    }
  }, [visible, draftConfig])

  // Reset pick when teams changes
  React.useEffect(() => {
    if (selectedTeams !== null && (selectedPick === null || selectedPick > selectedTeams)) {
      setSelectedPick(null)
    }
  }, [selectedTeams, selectedPick])

  const teamOptions = [
    { label: '6 Teams', value: 6 },
    { label: '8 Teams', value: 8 },
    { label: '10 Teams', value: 10 },
    { label: '12 Teams', value: 12 }
  ]

  const pickOptions = React.useMemo(() => {
    if (!selectedTeams) return []
    return Array.from({ length: selectedTeams }, (_, i) => ({
      label: `Pick ${i + 1}`,
      value: i + 1
    }))
  }, [selectedTeams])

  const isFormValid = selectedTeams !== null && selectedPick !== null

  const handleLetsDraft = async () => {
    if (!isFormValid || !selectedTeams || !selectedPick || isStreaming) return

    const config = { teams: selectedTeams, pick: selectedPick }

    // Close modal immediately
    onHide()

    // Check if we're already in offline mode
    if (isOfflineMode) {
      console.log('1.3/4: App is in offline mode, initializing offline draft')
      initializeDraftOffline(config)
      toast.current?.show({
        severity: 'info',
        summary: 'Draft Initialized (Offline)',
        detail: 'Draft configuration saved. AI analysis unavailable in offline mode.',
        life: 3000
      })
      onDraftInitialized?.()
      return
    }

    // Prepare players payload - limit to top 200 available players
    const availablePlayers = players
      .filter(player => !isDrafted(player.id) && !isTaken(player.id))
      .slice(0, 200);

    const payload = {
      numTeams: selectedTeams,
      userPickPosition: selectedPick,
      players: availablePlayers
    }

    // DEV logs before initialize
    if (import.meta.env.DEV) {
      console.log('[INIT][click] payload:', { numTeams: selectedTeams, userPickPosition: selectedPick, playersCount: availablePlayers.length });
    }

    // Show loading toast
    toast.current?.show({
      severity: 'info',
      summary: 'Initializing Draft',
      detail: 'Setting up your draft with AI analysis...',
      life: 0,
      sticky: true
    })

    try {
      // Use streaming hook with correct payload format
      await startStream({
        scope: 'draft',
        action: 'initialize',
        payload
      })

      console.log('[INIT][start] called useLlmStream');

      // Clear the loading toast
      toast.current?.clear()

      // Store the streaming response data in the draft store
      if (conversationId) {
        initializeDraftState(
          conversationId,
          tokens || 'Draft strategy initialized via streaming.',
          config
        )
      }

      // Show success toast
      toast.current?.show({
        severity: 'success',
        summary: 'Draft Initialized',
        detail: 'AI analysis is ready! Check the AI Analysis drawer for insights.',
        life: 3000
      })

      // Trigger AI Analysis drawer
      onDraftInitialized?.()
    } catch (err) {
      console.log('4/4: Streaming call failed with error', {
        error: err instanceof Error ? err.message : String(err),
        streamError
      })
      
      // Clear the loading toast
      toast.current?.clear()

      // Enter offline mode and set up offline draft
      setOfflineMode(true)
      setShowOfflineBanner(true)
      initializeDraftOffline(config)

      // Store the failed API call for potential retry
      addPendingApiCall('initializeDraft', {
        numTeams: selectedTeams,
        userPickPosition: selectedPick,
        players: players.filter(player => !isDrafted(player.id) && !isTaken(player.id)).slice(0, 200)
      })

      // Show error toast with streaming error if available
      const errorMessage = streamError || (err instanceof Error ? err.message : 'Failed to initialize draft')
      toast.current?.show({
        severity: 'error',
        summary: 'Unable to initialize draft',
        detail: `Network error: ${errorMessage}. Continuing in offline mode.`,
        life: 5000
      })

      // Still trigger the drawer since we have offline functionality
      onDraftInitialized?.()
    }
  }

  const handleDismiss = () => {
    setError(null)
    onHide()
  }

  // Reset error when modal opens
  React.useEffect(() => {
    if (visible) {
      setError(null)
    }
  }, [visible])

  return (
    <Dialog
      visible={visible}
      onHide={() => {}} // Prevent closing by clicking outside or escape
      header="Configure Your Draft"
      style={{ width: '500px' }}
      modal={true}
      closable={false} // Remove X button
      maskStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      contentStyle={{ padding: '2rem' }}
    >
      <div className="space-y-6">
        {error && (
          <Message
            severity="error"
            text={error}
            className="w-full"
          />
        )}
        
        {streamError && (
          <Message
            severity="error"
            text={`Stream error: ${streamError}`}
            className="w-full"
          />
        )}
        
        {players.length === 0 && (
          <Message
            severity="warn"
            text="Add at least one player to begin."
            className="w-full"
          />
        )}
        
        {lastEvent?.type === 'phase' && (
          <div className="text-gray-500 text-xs">Phase: {lastEvent.step} {lastEvent.status ? `(status ${lastEvent.status})` : ''}</div>
        )}
        
        {tokens && isStreaming && (
          <div className="mt-4 p-3 bg-gray-100 rounded border">
            <div className="text-sm font-medium mb-2">AI Strategy (streaming):</div>
            <pre className="text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">{tokens}</pre>
          </div>
        )}
        
        <div>
          <label 
            htmlFor="teams-dropdown" 
            className="block text-sm font-medium mt-4 mb-2"
          >
            How many teams are in the draft?
          </label>
          <Dropdown
            id="teams-dropdown"
            value={selectedTeams}
            options={teamOptions}
            onChange={(e) => setSelectedTeams(e.value)}
            placeholder="Select number of teams"
            className="w-full"
            style={{ minHeight: '40px' }}
          />
        </div>

        <div>
          <label 
            htmlFor="pick-dropdown" 
            className="block text-sm font-medium mt-4 mb-2"
          >
            What pick are you?
          </label>
          <Dropdown
            id="pick-dropdown"
            value={selectedPick}
            options={pickOptions}
            onChange={(e) => setSelectedPick(e.value)}
            placeholder="Select your pick"
            disabled={!selectedTeams}
            className="w-full"
            style={{ minHeight: '40px' }}
          />
        </div>

        <div className="flex justify-center gap-3 pt-4 mt-4">
          <Button
            label={isStreaming ? 'Initializing…' : "Let's Draft!"}
            onClick={handleLetsDraft}
            disabled={!isFormValid || isStreaming}
            className="p-button-success"
            style={{ minWidth: '120px' }}
          />
          {isStreaming && (
            <Button
              label="Stop"
              onClick={abortStream}
              className="p-button-danger"
              outlined
              style={{ minWidth: '100px' }}
            />
          )}
          {!isStreaming && (
            <Button
              label="Cancel"
              onClick={handleDismiss}
              className="p-button-secondary"
              outlined
              style={{ minWidth: '100px' }}
            />
          )}
        </div>
      </div>
    </Dialog>
  )
}