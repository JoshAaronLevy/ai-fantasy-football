import { forwardRef } from 'react'
import { Card } from 'primereact/card'
import { Button } from 'primereact/button'
import { ProgressSpinner } from 'primereact/progressspinner'
import { MarkdownRenderer } from '../common/MarkdownRenderer'

interface StreamingContentProps {
  streamText: string;
  isStreaming: boolean;
  error?: { message?: string } | null;
  onCancel?: () => void;
  onCopy?: () => void;
}

export const StreamingContent = forwardRef<HTMLDivElement, StreamingContentProps>(({
  streamText,
  isStreaming,
  error,
  onCancel,
  onCopy
}, ref) => {
  return (
    <Card
      title="AI Assistant - Live Analysis"
      className="mb-4"
      style={{ backgroundColor: '#f0f9ff' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isStreaming && (
            <ProgressSpinner style={{ width: '20px', height: '20px' }} strokeWidth="4" />
          )}
          <span className="text-sm font-medium text-blue-800">
            {isStreaming ? 'AI is thinking...' : 'Analysis Complete'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onCopy && streamText && (
            <Button
              icon="pi pi-copy"
              className="p-button-text p-button-sm"
              onClick={onCopy}
              tooltip="Copy analysis"
              tooltipOptions={{ position: 'left' }}
            />
          )}
          {onCancel && (
            <Button
              icon="pi pi-times"
              className="p-button-text p-button-sm"
              onClick={onCancel}
              tooltip="Close streaming analysis"
              tooltipOptions={{ position: 'left' }}
            />
          )}
        </div>
      </div>
      
      <div
        ref={ref}
        className="max-h-64 overflow-y-auto bg-white p-3 rounded border"
        style={{ minHeight: '100px' }}
      >
        {error ? (
          <div className="text-red-600 text-sm">
            <i className="pi pi-exclamation-triangle mr-2"></i>
            Error: {error.message || 'An error occurred'}
          </div>
        ) : streamText ? (
          <MarkdownRenderer
            content={streamText}
            className="prose max-w-none text-sm text-gray-700 leading-relaxed"
          />
        ) : isStreaming ? (
          <div className="text-gray-500 text-sm italic">
            Building your draft plan...
          </div>
        ) : (
          <div className="text-gray-500 text-sm italic">
            No analysis yet.
          </div>
        )}
      </div>
    </Card>
  )
})

StreamingContent.displayName = 'StreamingContent'