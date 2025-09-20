import React from 'react';
import { useSeasonStore } from '../../state/seasonStore';
import { useRosterAnalysisStream } from '../../hooks/useRosterAnalysisStream';
import { RosterTable } from './RosterTable';
import type { ApiPlayer } from '../../types';

export const RosterComparison: React.FC = () => {
  const { userRoster, setAnalysisResults } = useSeasonStore();
  const { start } = useRosterAnalysisStream();
  
  const handleAnalyzeRoster = (players: ApiPlayer[]) => {
    start(players, {
      onComplete: (data) => setAnalysisResults(data),
      onError: (e) => console.error('[analyze] error', e),
    });
  };

  const handleResetAnalysis = () => {
    console.log('[DEBUG] Reset Analysis button clicked');
    console.log('[DEBUG] Current userRoster before reset:', userRoster.map(p => ({
      name: p.name,
      projectedPoints: p.matchup?.projectedPoints
    })));
    setAnalysisResults(null);
    console.log('[DEBUG] setAnalysisResults(null) called');
  };

  const results = useSeasonStore(s => s.analysisResults);
  const scoring = results?.meta?.scoringPolicy;

  return (
    <div>
      {/* Display the fetched roster data */}
      {userRoster?.length ? (
        <RosterTable
          userRoster={userRoster}
          teamName="Boykies"
          enableUserSelectionAndFocus={true}
          onAnalyzeRoster={handleAnalyzeRoster}
          onResetAnalysis={handleResetAnalysis}
        />
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-600">No roster data available</p>
        </div>
      )}

      {/* Display scoring policy badge */}
      {scoring && (
        <div className="mt-4">
          <span className="badge">
            {scoring === 'custom-overrides' ? 'Custom Scoring' : 'ESPN Defaults'}
          </span>
        </div>
      )}

      {/* Analysis results preview */}
      {results?.players?.length ? (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-4">Analysis Results</h3>
          <ul>
            {results.players.map(p => (
              <li key={p.id ?? p.name}>
                <strong>{p.name}</strong> ({p.position}) — LLM: {p.matchup?.projectedPoints?.llm ?? '—'}
                {p.analysis ? <div className="analysis">{p.analysis}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default RosterComparison;