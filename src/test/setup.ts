/**
 * Vitest test setup file
 * Configures global test utilities and mocks
 */

import '@testing-library/jest-dom'

// Global test utilities
export const createMockEventSource = () => {
  const mockEventSource = {
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onopen: null,
    onmessage: null,
    onerror: null,
    readyState: 0,
    url: '',
    withCredentials: false,
    CONNECTING: 0,
    OPEN: 1,
    CLOSED: 2,
  }

  // Mock the global EventSource constructor
  global.EventSource = vi.fn().mockImplementation(() => mockEventSource)

  return mockEventSource
}

export const createMockFetch = () => {
  const mockFetch = vi.fn()
  global.fetch = mockFetch
  return mockFetch
}

export const createMockAbortController = () => {
  const mockAbortController = {
    signal: {
      aborted: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    },
    abort: vi.fn(),
  }

  global.AbortController = vi.fn().mockImplementation(() => mockAbortController)
  return mockAbortController
}

export const createMockReadableStream = (chunks: string[]) => {
  let chunkIndex = 0
  
  return new ReadableStream({
    start(controller) {
      const pump = () => {
        if (chunkIndex < chunks.length) {
          const chunk = chunks[chunkIndex++]
          controller.enqueue(new TextEncoder().encode(chunk))
          return pump()
        } else {
          controller.close()
        }
      }
      pump()
    }
  })
}

// Mock PrimeReact components for component tests
vi.mock('primereact/sidebar', () => ({
  Sidebar: ({ children, ...props }: any) => <div data-testid="sidebar" {...props}>{children}</div>
}))

vi.mock('primereact/button', () => ({
  Button: ({ children, label, onClick, ...props }: any) => 
    <button data-testid="button" onClick={onClick} {...props}>{label || children}</button>
}))

vi.mock('primereact/card', () => ({
  Card: ({ children, title, ...props }: any) => (
    <div data-testid="card" {...props}>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  )
}))

vi.mock('primereact/tag', () => ({
  Tag: ({ value, ...props }: any) => <span data-testid="tag" {...props}>{value}</span>
}))

vi.mock('primereact/scrollpanel', () => ({
  ScrollPanel: ({ children, ...props }: any) => <div data-testid="scroll-panel" {...props}>{children}</div>
}))

vi.mock('primereact/progressspinner', () => ({
  ProgressSpinner: (props: any) => <div data-testid="progress-spinner" {...props} />
}))

vi.mock('primereact/message', () => ({
  Message: ({ text, severity, ...props }: any) => 
    <div data-testid="message" data-severity={severity} {...props}>{text}</div>
}))

// Setup beforeEach and afterEach for tests
beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})