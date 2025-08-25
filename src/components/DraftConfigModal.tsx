/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react'
import { Dialog } from 'primereact/dialog'
import { Dropdown } from 'primereact/dropdown'
import { Button } from 'primereact/button'
import { Message } from 'primereact/message'
import { Toast } from 'primereact/toast'
import { useDraftStore } from '../state/draftStore'
import { getUserId, getConversationId, setConversationId } from '../lib/storage/localStore'
import { marcoPingBlocking, initializeDraftBlocking, getTextFromLlmResponse, formatApiError } from '../lib/api'
import { mapToSlimTopN } from '../lib/players/slim'
import { LoadingModal } from './LoadingModal'

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
    initializeDraftOffline,
    setAiAnswer
  } = useDraftStore()
  
  const [selectedTeams, setSelectedTeams] = React.useState<number | null>(draftConfig.teams)
  const [selectedPick, setSelectedPick] = React.useState<number | null>(draftConfig.pick)
  const [error, setError] = React.useState<string | null>(null)
  const [isInitializing, setIsInitializing] = React.useState(false)

  // StrictMode guard to prevent double-fire of Marco ping
  const marcoPingFiredRef = React.useRef(false)

  React.useEffect(() => {
    if (marcoPingFiredRef.current) return;
    marcoPingFiredRef.current = true;

    (async () => {
      try {
        const { answer, upstreamStatus, duration_ms } = await marcoPingBlocking();
      } catch (e) {
        console.error('[MARCO ERROR]', e);
      }
    })();
  }, []);

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

  const onLetsDraft = async () => {
    console.log('player[0]: ', players[0]);

    // Early return guard for duplicate clicks
    if (isInitializing) {
      console.debug('INIT DRAFT: blocked (already initializing)');
      return;
    }

    if (!isFormValid || !selectedTeams || !selectedPick || players.length === 0) return

    const config = { teams: selectedTeams, pick: selectedPick }

    // Validate players dataset
    if (players.length === 0) {
      setError('No players available. Please ensure player data is loaded.');
      return;
    }

    // Validate user ID generation before proceeding
    try {
      const userId = getUserId();
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        toast.current?.show({
          severity: 'error',
          summary: 'Session Error',
          detail: 'Failed to create user id. Please refresh the page.',
          life: 5000
        });
        return;
      }
    } catch (error) {
      console.error('Failed to generate user ID:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Session Error',
        detail: 'Failed to create user id. Please refresh the page.',
        life: 5000
      });
      return;
    }

    setIsInitializing(true)
    setError(null)

    // Check if we're already in offline mode
    if (isOfflineMode) {
      try {
        initializeDraftOffline(config)
        toast.current?.show({
          severity: 'info',
          summary: 'Draft Initialized (Offline)',
          detail: 'Draft configuration saved. AI analysis unavailable in offline mode.',
          life: 3000
        })
        onHide()
        onDraftInitialized?.()
      } finally {
        setIsInitializing(false)
      }
      return
    }

    try {
      // Build top players (slimmedRoster) as an array of slim players limited to 12
      const availablePlayers = players
        .filter(player => !isDrafted(player.id) && !isTaken(player.id))

      // OLD: const top25Slim = mapToSlimTopN(availablePlayers, 25)
      const slimmedRoster = mapToSlimTopN(availablePlayers, 6)

      // Construct the request payload without conversationId
      const payload = {
        numTeams: selectedTeams,
        userPickPosition: selectedPick,
        players: slimmedRoster
      }

      // Log payload size in dev mode
      if (import.meta.env.DEV) {
        const bytes = new TextEncoder().encode(JSON.stringify(payload)).length
        console.log('[INIT payload bytes]', bytes)
      }

      console.debug('INIT DRAFT: calling initialize API');
      const data = await initializeDraftBlocking(payload)
      console.debug('INIT DRAFT: initialize API success');

      // Check for server error response
      if (data?.error) {
        const errorDetail = formatApiError(data, 'Draft initialization failed')
        
        toast.current?.show({
          severity: 'error',
          summary: 'Draft Initialization Failed',
          detail: errorDetail,
          life: 5000
        })
        
        return
      }

      // Store conversationId in localStorage if present
      if (data.conversationId) {
        setConversationId('draft', data.conversationId)
      }

      // Get normalized content from response
      const strategyContent = getTextFromLlmResponse(data)

      // Push initial strategy message to the UI
      setAiAnswer(strategyContent)

      // Initialize draft state
      initializeDraftState(
        data.conversationId || '',
        strategyContent || 'Draft strategy initialized.',
        config
      )

      // Show success toast
      toast.current?.show({
        severity: 'success',
        summary: 'Draft Initialized',
        detail: 'AI analysis is ready! Check the AI Analysis drawer for insights.',
        life: 3000
      })

      // Close modal and open AI drawer
      onHide()
      onDraftInitialized?.()
    } catch (err) {
      console.debug('INIT DRAFT: initialize API error', err);
      // Enter offline mode and set up offline draft
      setOfflineMode(true)
      setShowOfflineBanner(true)
      initializeDraftOffline(config)

      // Store the failed API call for potential retry
      const availablePlayers = players
        .filter(player => !isDrafted(player.id) && !isTaken(player.id))
      
      addPendingApiCall('initializeDraft', {
        numTeams: selectedTeams,
        userPickPosition: selectedPick,
        players: availablePlayers.slice(0, 200)
      })

      // Show error message
      const errorMessage = err instanceof Error ? err.message : 'Initialize failed'
      toast.current?.show({
        severity: 'error',
        summary: 'Unable to initialize draft',
        detail: `Network error: ${errorMessage}. Continuing in offline mode.`,
        life: 5000
      })

      // Close modal and still trigger the drawer since we have offline functionality
      onHide()
      onDraftInitialized?.()
    } finally {
      console.debug('INIT DRAFT: initialize done (clearing initializing flag)');
      setIsInitializing(false)
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
        
        {players.length === 0 && (
          <Message
            severity="warn"
            text="Add at least one player to begin."
            className="w-full"
          />
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

        <div className="modal-buttons flex justify-center gap-3 pt-4 mt-4">
          <Button
            label={isInitializing ? 'Initializing…' : "Start Draft!"}
            onClick={onLetsDraft}
            disabled={!isFormValid || isInitializing || players.length === 0}
            className="p-button-success"
            style={{ minWidth: '120px' }}
          />
          {!isInitializing && (
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
      
      <LoadingModal
        visible={isInitializing}
        title="Initializing draft…"
        message="This may take up to a few minutes"
      />
    </Dialog>
  )
}