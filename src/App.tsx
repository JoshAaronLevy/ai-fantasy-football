import React from 'react'
import { Header } from './components/Header'
import { PlayersGrid } from './components/PlayersGrid'
import { DraftConfigModal } from './components/DraftConfigModal'
import { useDraftStore } from './state/draftStore'

export default function App() {
  const isDraftConfigured = useDraftStore((s) => s.isDraftConfigured)
  const [showConfigModal, setShowConfigModal] = React.useState(false)

  // Show modal on first load if draft is not configured
  React.useEffect(() => {
    if (!isDraftConfigured()) {
      setShowConfigModal(true)
    }
  }, [isDraftConfigured])

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="custom-main">
        <PlayersGrid />
      </main>
      <DraftConfigModal
        visible={showConfigModal}
        onHide={() => setShowConfigModal(false)}
      />
    </div>
  )
}
