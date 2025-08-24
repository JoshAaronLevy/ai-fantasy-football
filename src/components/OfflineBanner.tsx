import React from 'react'
import { Message } from 'primereact/message'
import { Button } from 'primereact/button'
import { useDraftStore } from '../state/draftStore'

export const OfflineBanner: React.FC = () => {
  const showOfflineBanner = useDraftStore((s) => s.showOfflineBanner)
  const isOfflineMode = useDraftStore((s) => s.isOfflineMode)
  const dismissOfflineBanner = useDraftStore((s) => s.dismissOfflineBanner)

  if (!showOfflineBanner || !isOfflineMode) {
    return null
  }

  return (
    <div className="w-full bg-yellow-50 border-b border-yellow-200 p-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <i className="pi pi-exclamation-triangle text-yellow-600" />
          <span className="text-yellow-800 font-medium">
            Unable to connect to API. Currently using offline mode.
          </span>
          <span className="text-yellow-700 text-sm">
            You can still track your draft, but AI analysis is unavailable.
          </span>
        </div>
        <Button
          icon="pi pi-times"
          onClick={dismissOfflineBanner}
          text
          rounded
          severity="warning"
          size="small"
          className="text-yellow-700 hover:text-yellow-900"
          tooltip="Dismiss this warning"
        />
      </div>
    </div>
  )
}