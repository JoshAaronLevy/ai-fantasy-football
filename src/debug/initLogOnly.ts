/**
 * Debug utility for log-only streaming of the Initialize Draft API call.
 * This utility is purely for diagnostic logging and does not touch any UI state,
 * Zustand stores, or React components.
 */

// Global state for the debug utility
let globalAbortController: AbortController | null = null;

/**
 * Starts a log-only stream of the Initialize Draft API call.
 * Makes a fetch to '/api/draft/initialize?stream=1' and logs all streaming data
 * to the console for debugging purposes.
 * 
 * @param payload - The payload to send to the API
 * @returns Promise that resolves when streaming completes
 */
export async function startInitializeLogOnly(payload: unknown): Promise<void> {
  // Cancel any existing stream first
  cancelInitializeLogOnly();

  // Create new abort controller
  const controller = new AbortController();
  globalAbortController = controller;

  // Start timing
  const t0 = performance.now();
  let chunkIndex = 0;
  let totalLines = 0;
  let totalErrors = 0;
  let totalBytes = 0;

  console.log('[init-log] Starting initialize stream debug session', {
    timestamp: new Date().toISOString(),
    payload
  });

  try {
    const response = await fetch('/api/draft/initialize?stream=1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/x-ndjson'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[init-log] HTTP error', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    if (!response.body) {
      console.warn('[init-log] No response body available for streaming');
      return;
    }

    // Set up streaming
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    console.log('[init-log] Stream started successfully');

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('[init-log] Stream ended (done=true)');
          break;
        }

        if (value) {
          totalBytes += value.length;
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Process complete lines from buffer
          const lines = buffer.split('\n');
          // Keep the last line in buffer as it might be incomplete
          buffer = lines.pop() || '';

          // Process each complete line
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            totalLines++;
            const dt = Math.round(performance.now() - t0);
            let parsedJson: unknown = null;

            // Try to parse as JSON
            try {
              parsedJson = JSON.parse(trimmedLine);
            } catch {
              // Not valid JSON, parsedJson remains null
            }

            // Log with standard format
            console.log('[init-log]', {
              idx: chunkIndex++,
              dt,
              line: trimmedLine,
              json: parsedJson
            });

            // Special handling for structured error events
            if (parsedJson &&
                typeof parsedJson === 'object' &&
                parsedJson !== null &&
                'event' in parsedJson &&
                (parsedJson as Record<string, unknown>).event === 'error') {
              totalErrors++;
              console.warn('[init-log][error-event]', {
                idx: chunkIndex - 1,
                dt,
                errorEvent: parsedJson
              });
            }
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim()) {
        const trimmedLine = buffer.trim();
        totalLines++;
        const dt = Math.round(performance.now() - t0);
        let parsedJson: unknown = null;

        try {
          parsedJson = JSON.parse(trimmedLine);
        } catch {
          // Not valid JSON, parsedJson remains null
        }

        console.log('[init-log]', {
          idx: chunkIndex++,
          dt,
          line: trimmedLine,
          json: parsedJson
        });

        // Check for error event in final buffer
        if (parsedJson &&
            typeof parsedJson === 'object' &&
            parsedJson !== null &&
            'event' in parsedJson &&
            (parsedJson as Record<string, unknown>).event === 'error') {
          totalErrors++;
          console.warn('[init-log][error-event]', {
            idx: chunkIndex - 1,
            dt,
            errorEvent: parsedJson
          });
        }
      }

      // Log completion stats
      const totalTime = Math.round(performance.now() - t0);
      console.info('[init-log] Stream completed successfully', {
        totalTime,
        totalLines,
        totalChunks: chunkIndex,
        totalErrors,
        totalBytes,
        avgTimePerLine: totalLines > 0 ? Math.round(totalTime / totalLines) : 0
      });

    } catch (error) {
      if (controller.signal.aborted) {
        console.log('[init-log] Stream was cancelled');
        return;
      }
      
      console.error('[init-log] Stream reading error', error);
      throw error;
    } finally {
      reader.releaseLock();
    }

  } catch (error) {
    if (controller.signal.aborted) {
      console.log('[init-log] Request was cancelled');
      return;
    }

    const totalTime = Math.round(performance.now() - t0);
    console.error('[init-log] Request failed', {
      error: error instanceof Error ? error.message : String(error),
      totalTime,
      totalLines,
      totalChunks: chunkIndex,
      totalErrors,
      totalBytes
    });
    
    throw error;
  } finally {
    // Clean up global state
    if (globalAbortController === controller) {
      globalAbortController = null;
    }
  }
}

/**
 * Cancels the currently active initialize log-only stream.
 * Safe to call even if no stream is active.
 */
export function cancelInitializeLogOnly(): void {
  if (globalAbortController) {
    console.log('[init-log] Cancelling active stream');
    globalAbortController.abort();
    globalAbortController = null;
  }
}

/**
 * Returns whether a log-only stream is currently active.
 * @returns true if a stream is active, false otherwise
 */
export function isInitializeLogOnlyActive(): boolean {
  return globalAbortController !== null;
}