/**
 * Integration test for streaming client
 * This file demonstrates how to use the streaming client and verifies it integrates properly
 */

import { 
  streamLLM, 
  createStreamingClient, 
  detectTransport,
  StreamingError,
  type LlmBody,
  type StreamingEvent 
} from './index';

/**
 * Example usage of the streaming client
 */
export async function testStreamingIntegration() {
  console.log('Testing streaming client integration...');

  // Test transport detection
  const transport = detectTransport();
  console.log(`Detected transport: ${transport}`);

  // Test basic streaming setup
  const client = createStreamingClient({
    apiBase: '', // Uses environment default
    timeout: 10000,
    retryAttempts: 2,
  });

  console.log(`Client configured with mode: ${client.config.mode}`);

  // Example LLM request body
  const exampleBody: LlmBody = {
    message: "Hello, this is a test message",
    conversationId: "test-conversation-123",
    maxTokens: 100,
    temperature: 0.7,
  };

  try {
    // Create an AbortController for cancellation
    const controller = new AbortController();
    
    // Example: Set up a timeout to cancel the stream after 5 seconds
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 5000);

    console.log('Starting streaming request...');
    
    // Stream the response
    for await (const event of streamLLM(exampleBody, client.config, controller.signal)) {
      console.log('Received event:', event.type);
      
      // Handle different event types
      switch (event.type) {
        case 'chunk':
          console.log('Content chunk received');
          break;
        case 'done':
          console.log('Stream completed');
          clearTimeout(timeoutId);
          return;
        case 'error':
          console.error('Stream error:', event.data);
          break;
        case 'heartbeat':
          console.log('Heartbeat received');
          break;
      }
    }
  } catch (error) {
    if (error instanceof StreamingError) {
      console.error(`StreamingError [${error.type}]:`, error.message);
      if (error.retryable) {
        console.log('This error is retryable');
      }
    } else if (error instanceof Error && error.name === 'AbortError') {
      console.log('Stream was cancelled');
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

/**
 * Example of using individual streaming methods
 */
export async function testIndividualMethods() {
  const exampleBody: LlmBody = {
    message: "Test message",
    stream: true,
  };

  try {
    // Test fetch streaming
    console.log('Testing fetch streaming...');
    const controller = new AbortController();
    
    for await (const event of client.streamWithFetch(exampleBody, controller.signal)) {
      console.log('Fetch event:', event.type);
      if (event.type === 'done') break;
    }
  } catch (error) {
    console.log('Fetch streaming test completed (expected to fail without backend)');
  }

  try {
    // Test EventSource streaming
    console.log('Testing EventSource streaming...');
    const eventSource = client.streamWithEventSource({ ...exampleBody, stream: true });
    
    eventSource.onMessage((event: StreamingEvent) => {
      console.log('EventSource event:', event.type);
      if (event.type === 'done') {
        eventSource.close();
      }
    });

    eventSource.onError((error: StreamingError) => {
      console.log('EventSource error (expected without backend):', error.message);
      eventSource.close();
    });

    // Close after a short time
    setTimeout(() => {
      eventSource.close();
    }, 1000);
  } catch (error) {
    console.log('EventSource streaming test completed (expected to fail without backend)');
  }
}

// Create a client instance for testing
const client = createStreamingClient();

// Export for potential use in other parts of the application
export { client as defaultStreamingClient };