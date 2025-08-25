import React from 'react'

interface LoadingModalProps {
  visible: boolean
  title?: string
  message?: string
}

export const LoadingModal: React.FC<LoadingModalProps> = ({
  visible,
  message
}) => {
  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loading-title"
      onClick={(e) => e.stopPropagation()} // Prevent clicks from bubbling but don't dismiss
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl full-width">
        <div className="flex flex-col items-center justify-center space-y-2">
          {/* Tailwind-only spinner */}
          <div className="h-12 w-12 rounded-full border-4 border-gray-300 dark:border-gray-600 border-t-blue-600 dark:border-t-blue-400 animate-spin" />
          
          <div className="text-center">
            {message && (
              <p className="text-md">
                {message}
              </p>
            )}
            <p className="text-md">
              This may take up to a few minutes...
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}