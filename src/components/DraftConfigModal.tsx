import React from 'react'
import { Dialog } from 'primereact/dialog'
import { Dropdown } from 'primereact/dropdown'
import { Button } from 'primereact/button'
import { Message } from 'primereact/message'
import { useDraftStore } from '../state/draftStore'
import { initializeDraft } from '../lib/api'

interface DraftConfigModalProps {
  visible: boolean;
  onHide: () => void;
  onDraftInitialized?: () => void;
}

export const DraftConfigModal: React.FC<DraftConfigModalProps> = ({ visible, onHide, onDraftInitialized }) => {
  const { draftConfig, players, initializeDraftState } = useDraftStore()
  
  const [selectedTeams, setSelectedTeams] = React.useState<number | null>(draftConfig.teams)
  const [selectedPick, setSelectedPick] = React.useState<number | null>(draftConfig.pick)
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

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

  const isFormValid = selectedTeams !== null && selectedPick !== null && !isLoading

  const handleLetsDraft = async () => {
    if (!isFormValid || !selectedTeams || !selectedPick) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await initializeDraft({
        numTeams: selectedTeams,
        userPickPosition: selectedPick,
        players: players
      })

      // Store the response data in the draft store
      initializeDraftState(
        response.conversationId,
        response.strategy,
        { teams: selectedTeams, pick: selectedPick }
      )

      // Close modal and trigger AI Analysis drawer
      onHide()
      onDraftInitialized?.()
    } catch (err) {
      console.error('Failed to initialize draft:', err)
      setError(err instanceof Error ? err.message : 'Failed to initialize draft')
    } finally {
      setIsLoading(false)
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
        
        <div>
          <label 
            htmlFor="teams-dropdown" 
            className="block text-sm font-medium text-gray-700 mb-2"
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
            className="block text-sm font-medium text-gray-700 mb-2"
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

        <div className="flex justify-end gap-3 pt-4">
          <Button
            label="Dismiss"
            onClick={handleDismiss}
            className="p-button-danger"
            style={{ minWidth: '100px' }}
          />
          <Button
            label={isLoading ? "Initializing..." : "Let's Draft!"}
            onClick={handleLetsDraft}
            disabled={!isFormValid}
            loading={isLoading}
            className="p-button-success"
            style={{ minWidth: '120px' }}
          />
        </div>
      </div>
    </Dialog>
  )
}