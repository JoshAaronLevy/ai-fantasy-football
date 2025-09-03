import type { RosterApiPlayer } from '../../types';

export interface RosterApiError {
  code?: string | number;
  message: string;
}

export interface RosterAnalysisPayload {
  response_mode: 'blocking' | 'streaming';
  user: string;
  query: string;
  side: string;
  requestId: string;
  inputs: {
    roster: RosterApiPlayer[];
    week: number;
    weatherByGame: null | unknown;
  };
}

export interface RosterAnalysisResponse {
  [key: string]: unknown;
}

/**
 * Ensures each player in a roster has matchup.projectedPoints set to "0.00" for missing values.
 * This function implements the client-side projectedPoints defaulting logic as specified
 * in the requirements before making requests to ensure payload compatibility.
 *
 * @param roster - Array of roster players that may have missing projectedPoints
 * @returns New array with matchup.projectedPoints guaranteed to exist as "0.00" for missing values
 */
export function ensureProjectedPoints(roster: RosterApiPlayer[]): RosterApiPlayer[] {
  return roster.map(p => {
    // Only add projectedPoints when missing, without touching other fields
    if (p.matchup && p.matchup.projectedPoints == null) {
      p.matchup.projectedPoints = 0.00;
    }
    return p;
  });
}

/**
 * Analyzes roster data using streaming or blocking response mode
 * @param payload - The roster analysis payload with guaranteed projectedPoints
 * @param opts - Optional configuration including abort signal
 * @returns Raw response from roster analysis API
 * @throws {RosterApiError} If the request fails
 */
export async function analyzeRoster(payload: RosterAnalysisPayload, opts?: { signal?: AbortSignal }): Promise<Response> {
  try {
    // Apply client-side projectedPoints defaulting before making the request
    const processedPayload = {
      ...payload,
      inputs: {
        ...payload.inputs,
        roster: ensureProjectedPoints(payload.inputs.roster)
      }
    };

    const endpoint = '/api/roster/analyze';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Add streaming-specific headers if in streaming mode
    if (payload.response_mode === 'streaming') {
      headers['Accept'] = 'application/x-ndjson';
    }

    console.log('Sending payload to /roster/analyze:', processedPayload);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(processedPayload),
      signal: opts?.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response;
  } catch (error) {
    const err: RosterApiError = {
      message: error instanceof Error ? error.message : 'Failed to analyze roster'
    };
    throw err;
  }
}

/**
 * Creates a roster analysis payload with proper structure and defaults
 * @param userId - User identifier for the analysis request
 * @param userRoster - The user's roster to analyze
 * @param opponentRoster - The opponent's roster (optional, defaults to empty array)
 * @param week - The week number for analysis context
 * @param responseMode - Whether to use streaming or blocking response mode
 * @returns Properly structured payload for roster analysis
 */
export function createRosterAnalysisPayload(
  userId: string,
  userRoster: RosterApiPlayer[],
  week: number,
  responseMode: 'blocking' | 'streaming' = 'blocking'
): RosterAnalysisPayload {
  return {
    response_mode: responseMode,
    user: String(userId),
    query: 'Analyze roster for weekly projections.',
    side: 'user',
    requestId: crypto.randomUUID(),
    inputs: {
      roster: ensureProjectedPoints(userRoster),
      week,
      weatherByGame: null
    }
  };
}

/**
 * Validates that a roster array has proper structure for API calls
 * @param roster - The roster array to validate
 * @returns True if the roster has valid structure for API calls
 */
export function validateRosterStructure(roster: unknown): roster is RosterApiPlayer[] {
  if (!Array.isArray(roster)) {
    return false;
  }

  return roster.every(player => 
    player &&
    typeof player === 'object' &&
    typeof player.name === 'string' &&
    (typeof player.position === 'string' || typeof player.pos === 'string')
  );
}

/**
 * Processes roster data to ensure compatibility with streaming analysis
 * This function ensures all required fields are present and properly formatted
 * @param roster - Raw roster data from API or storage
 * @returns Processed roster ready for analysis
 */
export function prepareRosterForAnalysis(roster: RosterApiPlayer[]): RosterApiPlayer[] {
  return ensureProjectedPoints(roster).map(player => ({
    ...player,
    // Ensure position is normalized
    position: player.position || player.pos || 'N/A',
    // Ensure team structure is consistent
    team: typeof player.team === 'string'
      ? { abbr: player.team, logoUrl: `/logos/${player.team.toLowerCase()}.png` }
      : player.team,
    // Ensure fantasy team structure if present
    fantasyTeam: typeof player.fantasyTeam === 'string'
      ? { name: player.fantasyTeam }
      : player.fantasyTeam
  }));
}

/**
 * Analyzes roster data using streaming with buffered response
 * @param payload - The roster analysis payload with guaranteed projectedPoints
 * @param opts - Optional configuration including abort signal
 * @returns Buffered stream response as string
 * @throws {RosterApiError} If the request fails
 */
export async function analyzeRosterStreaming(payload: RosterAnalysisPayload, opts?: { signal?: AbortSignal }): Promise<string> {
  try {
    // Ensure streaming mode
    const streamingPayload = { ...payload, response_mode: 'streaming' as const };
    
    const response = await analyzeRoster(streamingPayload, opts);
    
    if (!response.body) {
      throw new Error('No response body available for streaming');
    }

    // Buffer the entire stream response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedContent = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        if (value) {
          const decodedText = decoder.decode(value, { stream: true });
          
          // Parse each line of the stream
          const lines = decodedText.split('\n');
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            
            try {
              const parsed = JSON.parse(trimmedLine);
              
              // Extract content from message and message_delta events
              if (parsed && typeof parsed === 'object' && 'event' in parsed) {
                const eventType = parsed.event;
                
                if ((eventType === 'message' || eventType === 'message_delta') && parsed.data) {
                  const piece = parsed.data.answer ?? parsed.data.delta ?? parsed.data.text ?? '';
                  if (piece) {
                    accumulatedContent += piece;
                  }
                }
              } else {
                // Not a structured event, treat as raw content
                accumulatedContent += trimmedLine;
              }
            } catch {
              // Not valid JSON, treat as raw content
              accumulatedContent += trimmedLine;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    // Console.log exactly once when complete with the full response text
    console.log('Roster analysis complete:', accumulatedContent);
    
    return accumulatedContent;
    
  } catch (error) {
    const err: RosterApiError = {
      message: error instanceof Error ? error.message : 'Failed to analyze roster with streaming'
    };
    throw err;
  }
}