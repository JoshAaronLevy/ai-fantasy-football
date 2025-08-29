/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react'
import { Dialog } from 'primereact/dialog'
import { Dropdown } from 'primereact/dropdown'
import { Button } from 'primereact/button'
import { Message } from 'primereact/message'
import { Toast } from 'primereact/toast'
import { useDraftStore } from '../state/draftStore'
import { getUserId, setConversationId, clearConversationId } from '../lib/storage/localStore'
import { initializeDraftBlocking, getTextFromLlmResponse, formatApiError } from '../lib/api'
import { mapToSlimTopN } from '../lib/players/slim'
import type { SlimPlayer } from '../lib/players/slim'
import { classifyError, extractErrorStatus } from '../lib/httpErrors'
import { LoadingModal } from './LoadingModal'
import { FORCE_OFFLINE_MODE } from '../lib/debug/devFlags'

interface DraftConfigModalProps {
  visible: boolean;
  onHide: () => void;
  onDraftInitialized?: () => void;
  toast: React.RefObject<Toast | null>;
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
    initializeDraftOffline,
    setAiAnswer,
    setAnalysisLoading
  } = useDraftStore()
  
  const [selectedTeams, setSelectedTeams] = React.useState<number | null>(draftConfig.teams)
  const [selectedPick, setSelectedPick] = React.useState<number | null>(draftConfig.pick)
  const [error, setError] = React.useState<string | null>(null)
  const [isInitializing, setIsInitializing] = React.useState(false)
  const [showRetryCompactOptions, setShowRetryCompactOptions] = React.useState(false)
  const [lastFailedPayload, setLastFailedPayload] = React.useState<{
    numTeams: number;
    userPickPosition: number;
    players: Array<SlimPlayer>;
    compact?: boolean;
    inputs?: { mode: string };
  } | null>(null)

  React.useEffect(() => {
    if (visible) {
      setSelectedTeams(draftConfig.teams)
      setSelectedPick(draftConfig.pick)
    }
  }, [visible, draftConfig])

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

  const initializeDraft = async (isCompactRetry = false) => {
    if (isInitializing) {
      console.debug('INIT DRAFT: blocked (already initializing)');
      return;
    }

    if (!isFormValid || !selectedTeams || !selectedPick || players.length === 0) return

    const config = { teams: selectedTeams, pick: selectedPick }

    if (players.length === 0) {
      setError('No players available. Please ensure player data is loaded.');
      return;
    }

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
    setAnalysisLoading(true)
    setError(null)
    setShowRetryCompactOptions(false)

    if (isOfflineMode || FORCE_OFFLINE_MODE) {
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
        setAnalysisLoading(false)
      }
      return
    }

    const availablePlayers = players
      .filter(player => !isDrafted(player.id) && !isTaken(player.id))

    const slimmedRoster = mapToSlimTopN(availablePlayers, 25)

    const payload = {
      numTeams: selectedTeams,
      userPickPosition: selectedPick,
      players: slimmedRoster,
      ...(isCompactRetry && { compact: true, inputs: { mode: 'compact' } })
    }

    // Close modal immediately for better UX
    onHide()

    try {
      const data = await initializeDraftBlocking(payload)

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

      if (data.conversationId) {
        setConversationId('draft', data.conversationId)
      }

      const strategyContent = getTextFromLlmResponse(data)

      setAiAnswer(strategyContent)

      initializeDraftState(
        data.conversationId || '',
        strategyContent || 'Draft strategy initialized.',
        config
      )

      toast.current?.show({
        severity: 'success',
        summary: 'Draft Initialized',
        detail: 'Ready to draft!',
        life: 3000
      })

      onDraftInitialized?.()
    } catch (e: unknown) {
      const status = extractErrorStatus(e)
      
      // Handle 409 invalid_conversation specially
      if (status === 409) {
        clearConversationId('draft')
        toast.current?.show({
          severity: 'warn',
          summary: 'Session Expired',
          detail: 'Session expired. Please re-initialize your draft.',
          life: 5000
        })
        setIsInitializing(false)
        return // Keep modal open for re-initialization
      }

      const cls = classifyError(e)
      
      if (cls.offlineWorthy) {
        // For compact retry failures, go straight to offline mode
        if (isCompactRetry) {
          setOfflineMode(true)
          setShowOfflineBanner(true)
          toast.current?.show({
            severity: 'warn',
            summary: 'Connection Issue',
            detail: 'Switched to Offline Mode.',
            life: 5000
          })
          
          // Initialize offline and close modal
          initializeDraftOffline(config)
          onDraftInitialized?.()
        } else {
          // For initial failures, show retry compact options and close modal
          setLastFailedPayload(payload)
          setShowRetryCompactOptions(true)
          setOfflineMode(true)
          setShowOfflineBanner(true)
          toast.current?.show({
            severity: 'warn',
            summary: 'Connection Issue',
            detail: 'Connection issue — switched to Offline Mode.',
            life: 5000
          })
          // Modal already closed at start of try block
        }
      } else {
        // Non-offline-worthy errors: keep modal open and show inline error
        setError(`Failed (${cls.reason}). Check inputs and try again.`)
      }
    } finally {
      setIsInitializing(false)
      setAnalysisLoading(false)
    }
  }

  const onLetsDraft = () => initializeDraft(false)

  const onRetryCompact = () => {
    setShowRetryCompactOptions(false)
    initializeDraft(true)
  }

  const onGoOffline = () => {
    setShowRetryCompactOptions(false)
    const config = { teams: selectedTeams!, pick: selectedPick! }
    initializeDraftOffline(config)
    onDraftInitialized?.()
  }

  const handleDismiss = () => {
    setError(null)
    onHide()
  }

  React.useEffect(() => {
    if (visible) {
      setError(null)
      setShowRetryCompactOptions(false)
    }
  }, [visible])

  // Render retry compact options banner when needed
  const renderRetryCompactBanner = () => {
    if (!showRetryCompactOptions) return null

    return (
      <div className="w-full bg-orange-50 border border-orange-200 rounded-md p-4 mb-4">
        <div className="flex items-start gap-3">
          <i className="pi pi-exclamation-triangle text-orange-600 mt-1" />
          <div className="flex-1">
            <h4 className="font-medium text-orange-800 mb-2">
              Connection Issue
            </h4>
            <p className="text-orange-700 text-sm mb-3">
              Initial draft setup failed due to connection issues. You can retry with a faster compact mode or continue offline.
            </p>
            <div className="flex gap-2">
              <Button
                label="Retry Compact"
                onClick={onRetryCompact}
                size="small"
                severity="warning"
                className="text-orange-800"
                disabled={isInitializing}
              />
              <Button
                label="Go Offline"
                onClick={onGoOffline}
                size="small"
                outlined
                severity="warning"
                className="text-orange-800 border-orange-400"
                disabled={isInitializing}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <Dialog
        visible={visible}
        onHide={() => {}}
        header="Configure Your Draft"
        style={{ width: '600px' }}
        modal={true}
        closable={false}
        maskStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        contentStyle={{ padding: '0 2rem 2rem 2rem' }}
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
          message="The AI Assistant is preparing your personalized draft strategy."
        />
      </Dialog>

      {/* Retry Compact Options Banner - positioned over app when modal is closed */}
      {showRetryCompactOptions && (
        <div className="fixed top-16 left-0 right-0 z-50 px-4">
          <div className="max-w-2xl mx-auto">
            {renderRetryCompactBanner()}
          </div>
        </div>
      )}
    </>
  )
}