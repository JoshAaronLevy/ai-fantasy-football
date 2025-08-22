import React from 'react'
import { Dialog } from 'primereact/dialog'
import { Dropdown } from 'primereact/dropdown'
import { Button } from 'primereact/button'
import { useDraftStore } from '../state/draftStore'

interface DraftConfigModalProps {
  visible: boolean;
  onHide: () => void;
}

export const DraftConfigModal: React.FC<DraftConfigModalProps> = ({ visible, onHide }) => {
  const { draftConfig, setDraftConfig } = useDraftStore()
  
  const [selectedTeams, setSelectedTeams] = React.useState<number | null>(draftConfig.teams)
  const [selectedPick, setSelectedPick] = React.useState<number | null>(draftConfig.pick)

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

  const handleLetsDraft = () => {
    if (isFormValid) {
      setDraftConfig({ teams: selectedTeams, pick: selectedPick })
      onHide()
    }
  }

  const handleDismiss = () => {
    setDraftConfig({ teams: null, pick: null })
    onHide()
  }

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
            label="Let's Draft!"
            onClick={handleLetsDraft}
            disabled={!isFormValid}
            className="p-button-success"
            style={{ minWidth: '120px' }}
          />
        </div>
      </div>
    </Dialog>
  )
}