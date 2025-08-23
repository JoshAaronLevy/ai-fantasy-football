import React from 'react'
import { Header } from './components/Header'
import { PlayersGrid } from './components/PlayersGrid'
import { DraftConfigModal } from './components/DraftConfigModal'
import { AIAnalysisDrawer } from './components/AIAnalysisDrawer'
import { useDraftStore } from './state/draftStore'
import { fetchPlayers } from './lib/api'

export default function App() {
  const isDraftConfigured = useDraftStore((s) => s.isDraftConfigured)
  const setPlayers = useDraftStore((s) => s.setPlayers)
  const setPlayersLoading = useDraftStore((s) => s.setPlayersLoading)
  const setPlayersError = useDraftStore((s) => s.setPlayersError)
  const players = useDraftStore((s) => s.players)
  
  const [showConfigModal, setShowConfigModal] = React.useState(false)
  const [showAIAnalysis, setShowAIAnalysis] = React.useState(false)

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
        } catch (error) {
          console.error('Failed to fetch players:', error)
          setPlayersError(error instanceof Error ? error.message : 'Failed to fetch players')
        } finally {
          setPlayersLoading(false)
        }
      }
    }

    loadPlayers()
  }, [players.length, setPlayers, setPlayersLoading, setPlayersError])

  // Show modal on first load if draft is not configured
  React.useEffect(() => {
    if (!isDraftConfigured()) {
      setShowConfigModal(true)
    }
  }, [isDraftConfigured])

  return (
    <div className="min-h-screen flex flex-col">
      <Header onViewAIAnalysis={() => setShowAIAnalysis(true)} />
      <main className="custom-main">
        <PlayersGrid />
      </main>
      <DraftConfigModal
        visible={showConfigModal}
        onHide={() => setShowConfigModal(false)}
        onDraftInitialized={() => setShowAIAnalysis(true)}
      />
      <AIAnalysisDrawer
        visible={showAIAnalysis}
        onHide={() => setShowAIAnalysis(false)}
      />
    </div>
  )
}
