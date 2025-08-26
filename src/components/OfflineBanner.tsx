import React, { useState, useEffect } from 'react'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { ProgressBar } from 'primereact/progressbar'
import { Badge } from 'primereact/badge'
import { useDraftStore } from '../state/draftStore'
import { pingMarco } from '../lib/api'
import { classifyError } from '../lib/httpErrors'

interface OfflineBannerProps {
  toast?: React.RefObject<Toast | null>
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ toast }) => {
  const isOfflineMode = useDraftStore((s) => s.isOfflineMode)
  const setOfflineMode = useDraftStore((s) => s.setOfflineMode)
  const processQueue = useDraftStore((s) => s.processQueue)
  const syncStatus = useDraftStore((s) => s.syncStatus)
  const actionQueue = useDraftStore((s) => s.actionQueue)
  const getPendingActions = useDraftStore((s) => s.getPendingActions)
  
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)

  // Monitor queue processing state
  useEffect(() => {
    setIsSyncing(actionQueue.isProcessing)
    
    // Calculate sync progress
    const totalActions = actionQueue.queue.length
    const processedActions = totalActions - syncStatus.pendingCount
    if (totalActions > 0) {
      setSyncProgress((processedActions / totalActions) * 100)
    } else {
      setSyncProgress(0)
    }
  }, [actionQueue.isProcessing, actionQueue.queue.length, syncStatus.pendingCount])

  if (!isOfflineMode) {
    return null
  }

  const handleReconnect = async () => {
    setIsReconnecting(true)
    
    try {
      // Step 1: Test connectivity
      const isConnected = await pingMarco()
      
      if (!isConnected) {
        toast?.current?.show({
          severity: 'warn',
          summary: 'Still offline',
          detail: 'Unable to reach the server. Please check your internet connection.',
          life: 4000
        })
        return
      }

      // Step 2: Exit offline mode
      setOfflineMode(false)
      
      // Step 3: Start queue processing if there are pending actions
      const pendingActions = getPendingActions()
      if (pendingActions.length > 0) {
        toast?.current?.show({
          severity: 'info',
          summary: 'Reconnected!',
          detail: `Syncing ${pendingActions.length} pending actions...`,
          life: 3000
        })
        
        // Step 4: Process the queue
        try {
          await processQueue()
          
          // Step 5: Handle sync results
          const updatedSyncStatus = useDraftStore.getState().syncStatus
          const totalSynced = pendingActions.length - updatedSyncStatus.pendingCount - updatedSyncStatus.failedCount - updatedSyncStatus.conflictCount
          
          if (updatedSyncStatus.conflictCount > 0) {
            toast?.current?.show({
              severity: 'warn',
              summary: 'Partial sync completed',
              detail: `${totalSynced} actions synced, ${updatedSyncStatus.conflictCount} conflicts need resolution`,
              life: 5000
            })
          } else if (updatedSyncStatus.failedCount > 0) {
            toast?.current?.show({
              severity: 'warn',
              summary: 'Partial sync completed',
              detail: `${totalSynced} actions synced, ${updatedSyncStatus.failedCount} failed. Actions saved locally.`,
              life: 5000
            })
          } else {
            toast?.current?.show({
              severity: 'success',
              summary: 'Sync complete!',
              detail: 'All actions synchronized successfully.',
              life: 3000
            })
          }
        } catch (syncError) {
          console.error('Queue processing failed:', syncError)
          
          // Check if we should re-enter offline mode
          const errorClassification = classifyError(syncError)
          if (errorClassification.offlineWorthy) {
            setOfflineMode(true)
            toast?.current?.show({
              severity: 'error',
              summary: 'Sync failed',
              detail: 'Network issues detected. Re-entering offline mode.',
              life: 4000
            })
          } else {
            toast?.current?.show({
              severity: 'warn',
              summary: 'Sync failed',
              detail: 'Some actions could not be synchronized. Actions saved locally.',
              life: 4000
            })
          }
        }
      } else {
        toast?.current?.show({
          severity: 'success',
          summary: 'Reconnected',
          detail: 'Successfully reconnected to the server.',
          life: 3000
        })
      }
    } catch (error) {
      console.error('Reconnect failed:', error)
      toast?.current?.show({
        severity: 'warn',
        summary: 'Connection failed',
        detail: 'Connection attempt failed. Please try again.',
        life: 4000
      })
    } finally {
      // Add a small delay to prevent rapid clicking
      setTimeout(() => {
        setIsReconnecting(false)
      }, 1000)
    }
  }

  const handleResolveConflicts = () => {
    toast?.current?.show({
      severity: 'info',
      summary: 'Conflict Resolution',
      detail: 'Conflict resolution interface coming soon. For now, conflicts are preserved in the queue.',
      life: 4000
    })
  }

  const totalPendingActions = syncStatus.pendingCount
  const hasConflicts = syncStatus.conflictCount > 0
  const hasFailed = syncStatus.failedCount > 0

  return (
    <div className="w-full bg-yellow-50 border-b border-yellow-200 p-3">
      <div className="max-w-7xl mx-auto">
        {/* Main banner content */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <i className="pi pi-wifi text-yellow-600" />
            <span className="text-yellow-800 font-medium">
              Working offline. {totalPendingActions > 0 && `${totalPendingActions} actions queued locally.`}
            </span>
            
            {/* Status badges */}
            <div className="flex gap-2">
              {totalPendingActions > 0 && (
                <Badge
                  value={totalPendingActions}
                  severity="warning"
                  className="text-xs"
                />
              )}
              {hasConflicts && (
                <Badge
                  value={`${syncStatus.conflictCount} conflicts`}
                  severity="danger"
                  className="text-xs"
                />
              )}
              {hasFailed && (
                <Badge
                  value={`${syncStatus.failedCount} failed`}
                  severity="secondary"
                  className="text-xs"
                />
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {hasConflicts && (
              <Button
                label="Resolve Conflicts"
                icon="pi pi-exclamation-triangle"
                onClick={handleResolveConflicts}
                severity="danger"
                size="small"
                outlined
                className="text-red-600 border-red-400 hover:bg-red-50"
              />
            )}
            
            <Button
              label={isReconnecting ? 'Reconnecting...' : 'Reconnect'}
              icon={isReconnecting ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'}
              onClick={handleReconnect}
              disabled={isReconnecting || isSyncing}
              severity="warning"
              size="small"
              className="text-yellow-800 border-yellow-400 hover:bg-yellow-100"
              tooltip="Attempt to reconnect to server"
            />
          </div>
        </div>

        {/* Sync progress bar */}
        {isSyncing && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-sm text-yellow-700 mb-1">
              <span>Syncing actions...</span>
              <span>{Math.round(syncProgress)}%</span>
            </div>
            <ProgressBar
              value={syncProgress}
              className="h-2"
              style={{ backgroundColor: '#fef3c7' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}