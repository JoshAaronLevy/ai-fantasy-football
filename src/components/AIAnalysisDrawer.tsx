import React from 'react'
import { Sidebar } from 'primereact/sidebar'
import { Button } from 'primereact/button'
import { Card } from 'primereact/card'
import { Tag } from 'primereact/tag'
import { useDraftStore } from '../state/draftStore'

interface AIAnalysisDrawerProps {
  visible: boolean;
  onHide: () => void;
}

export const AIAnalysisDrawer: React.FC<AIAnalysisDrawerProps> = ({ visible, onHide }) => {
  const myTeam = useDraftStore((s) => s.myTeam)
  const getTotalDraftedCount = useDraftStore((s) => s.getTotalDraftedCount)
  
  // Get roster players (for future display)
  const rosterPlayerIds = Object.keys(myTeam)
  const hasRoster = rosterPlayerIds.length > 0

  return (
    <Sidebar
      visible={visible}
      onHide={onHide}
      position="right"
      style={{
        width: '33.333333vw',
        maxWidth: '90vw',
        minWidth: '400px'
      }}
      className="ai-analysis-sidebar"
      header={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <i className="pi pi-chart-line text-xl"></i>
            <span className="font-semibold text-lg">AI Draft Analysis</span>
          </div>
          <Button
            icon="pi pi-times"
            onClick={onHide}
            text
            rounded
            severity="secondary"
            size="small"
            style={{ color: 'white' }}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-4 h-full">
        {/* Roster Section - Only show if user has drafted players */}
        {hasRoster && (
          <Card
            title="My Current Roster"
            className="mb-4"
            style={{ backgroundColor: '#f8f9fa' }}
          >
            <div className="flex flex-wrap gap-2">
              {rosterPlayerIds.map((playerId) => (
                <Tag
                  key={playerId}
                  value={`Player ${playerId.slice(0, 8)}...`}
                  severity="info"
                  className="mb-1"
                />
              ))}
            </div>
            <div className="text-sm text-gray-600 mt-2">
              {rosterPlayerIds.length} player{rosterPlayerIds.length !== 1 ? 's' : ''} drafted
            </div>
          </Card>
        )}

        {/* AI Analysis Content */}
        <div className="flex-1">
          <Card
            title="Draft Strategy & Recommendations"
            className="h-full"
          >
            <div className="space-y-4">
              {/* Placeholder content - this will be replaced with real AI analysis */}
              <div className="text-center text-gray-500 py-8">
                <i className="pi pi-robot text-4xl mb-4 block"></i>
                <h3 className="text-lg font-semibold mb-2">AI Analysis Coming Soon</h3>
                <p className="text-sm">
                  Configure your draft settings and start drafting to see AI-powered 
                  recommendations and strategy insights here.
                </p>
                
                {getTotalDraftedCount() === 0 && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-700">
                      <strong>Next Steps:</strong>
                      <br />
                      1. Configure your draft settings
                      <br />
                      2. Start marking players as "Taken" or "Drafted"
                      <br />
                      3. Get real-time AI analysis and recommendations
                    </p>
                  </div>
                )}
                
                {getTotalDraftedCount() > 0 && (
                  <div className="mt-4 p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-700">
                      <strong>Draft in Progress!</strong>
                      <br />
                      {getTotalDraftedCount()} players selected so far.
                      <br />
                      AI analysis will appear here as the draft progresses.
                    </p>
                  </div>
                )}
              </div>
              
              {/* Future sections for AI content */}
              {/*
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-800">Recommended Picks</h4>
                <div className="space-y-2">
                  // AI recommended players will go here
                </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-800">Players to Avoid</h4>
                <div className="space-y-2">
                  // AI cautioned players will go here
                </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-800">Strategy Summary</h4>
                <div className="text-sm text-gray-700">
                  // AI strategy explanation will go here
                </div>
              </div>
              */}
            </div>
          </Card>
        </div>
      </div>
    </Sidebar>
  )
}