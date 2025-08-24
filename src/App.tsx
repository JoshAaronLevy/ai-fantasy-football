import React from 'react'
import { Toast } from 'primereact/toast'
import { Header } from './components/Header'
import { PlayersGrid } from './components/PlayersGrid'
import { DraftConfigModal } from './components/DraftConfigModal'
import { AIAnalysisDrawer } from './components/AIAnalysisDrawer'
import { OfflineBanner } from './components/OfflineBanner'
import { LoadingModal } from './components/LoadingModal'
import { useDraftStore } from './state/draftStore'
import { fetchPlayers } from './lib/api'

export default function App() {
  const isDraftConfigured = useDraftStore((s) => s.isDraftConfigured)
  const setPlayers = useDraftStore((s) => s.setPlayers)
  const setPlayersLoading = useDraftStore((s) => s.setPlayersLoading)
  const setPlayersError = useDraftStore((s) => s.setPlayersError)
  const players = useDraftStore((s) => s.players)
  const setOfflineMode = useDraftStore((s) => s.setOfflineMode)
  const setShowOfflineBanner = useDraftStore((s) => s.setShowOfflineBanner)
  const isInitializingDraft = useDraftStore((s) => s.isInitializingDraft)
  
  const [showConfigModal, setShowConfigModal] = React.useState(false)
  const [showAIAnalysis, setShowAIAnalysis] = React.useState(false)
  
  // Toast ref for showing notifications
  const toast = React.useRef<Toast>(null)

  // Fetch players on component mount
  React.useEffect(() => {
    const loadPlayers = async () => {
      // Only fetch if we don't already have players loaded
      if (players.length === 0) {
        try {
          setPlayersLoading(true)
          setPlayersError(null)
          const playersData = await fetchPlayers()
          setPlayers(playersData)
          // If successful, ensure we're not in offline mode
          setOfflineMode(false)
          setShowOfflineBanner(false)
        } catch (error) {
          console.error('Failed to fetch players:', error)
          setPlayersError(error instanceof Error ? error.message : 'Failed to fetch players')
          
          // Enter offline mode
          setOfflineMode(true)
          setShowOfflineBanner(true)
          
          // Show error toast
          toast.current?.show({
            severity: 'error',
            summary: 'Unable to fetch players',
            detail: 'Network connection failed. The app will work in offline mode with limited functionality.',
            life: 5000
          })
        } finally {
          setPlayersLoading(false)
        }
      }
    }

    loadPlayers()
  }, [players.length, setPlayers, setPlayersLoading, setPlayersError, setOfflineMode, setShowOfflineBanner])

  // Show modal on first load if draft is not configured
  React.useEffect(() => {
    if (!isDraftConfigured()) {
      setShowConfigModal(true)
    }
  }, [isDraftConfigured])

  return (
    <div className="min-h-screen flex flex-col">
      <Toast ref={toast} />
      <OfflineBanner />
      <Header onViewAIAnalysis={() => setShowAIAnalysis(true)} />
      <main className="custom-main">
        <PlayersGrid />
      </main>
      <DraftConfigModal
        visible={showConfigModal}
        onHide={() => setShowConfigModal(false)}
        onDraftInitialized={() => setShowAIAnalysis(true)}
        toast={toast}
      />
      <AIAnalysisDrawer
        visible={showAIAnalysis}
        onHide={() => setShowAIAnalysis(false)}
      />
      <LoadingModal visible={isInitializingDraft} />
    </div>
  )
}
