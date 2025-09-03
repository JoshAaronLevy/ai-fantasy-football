import React from 'react'
import { Dropdown } from 'primereact/dropdown'
import { useSeasonStore } from '../../state'

interface WeekOption {
  label: string;
  value: number;
}

export const WeekSelector: React.FC = () => {
  const selectedWeek = useSeasonStore(s => s.selectedWeek)
  const setSelectedWeek = useSeasonStore(s => s.setSelectedWeek)
  const rostersLoading = useSeasonStore(s => s.rostersLoading)

  // Generate week options for Week 1 through Week 18
  const weekOptions: WeekOption[] = Array.from({ length: 18 }, (_, i) => ({
    label: `Week ${i + 1}`,
    value: i + 1
  }))

  const handleWeekChange = (value: number | null) => {
    if (value !== null) {
      setSelectedWeek(value)
    }
  }

  return (
    <div className="week-selector">
      <Dropdown
        value={selectedWeek}
        options={weekOptions}
        onChange={(e) => handleWeekChange(e.value)}
        optionLabel="label"
        optionValue="value"
        placeholder="Select week..."
        disabled={rostersLoading}
        className="week-selector-dropdown"
        style={{ minWidth: '150px' }}
        panelStyle={{ minWidth: '150px' }}
      />
    </div>
  )
}