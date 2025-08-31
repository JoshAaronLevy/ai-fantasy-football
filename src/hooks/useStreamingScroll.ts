import { useRef, useState, useEffect, useCallback } from 'react'
import type { RefObject } from 'react'
import type { ScrollPanel } from 'primereact/scrollpanel'

interface UseStreamingScrollOptions {
  autoStick?: boolean
  messageCount?: number
  isVisible?: boolean
  streamingContentLength?: number
}

interface UseStreamingScrollReturn {
  containerRef: RefObject<ScrollPanel | null>
  streamingContentRef: RefObject<HTMLDivElement | null>
  atBottom: boolean
  scrollToBottom: () => void
  onUserScroll: (info: { atBottom: boolean }) => void
  hasUnreadMessages: boolean
  showScrollButton: boolean
}

/**
 * Hook for managing scroll behavior in streaming content containers.
 * Provides auto-stick functionality, smooth scrolling, and unread message tracking.
 */
export function useStreamingScroll({
  autoStick = true,
  messageCount = 0,
  isVisible = true,
  streamingContentLength = 0
}: UseStreamingScrollOptions = {}): UseStreamingScrollReturn {
  // Refs for scroll management
  const containerRef = useRef<ScrollPanel>(null)
  const streamingContentRef = useRef<HTMLDivElement>(null)
  
  // Scroll state management
  const [isUserAtBottom, setIsUserAtBottom] = useState(true)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false)
  const [lastSeenMessageCount, setLastSeenMessageCount] = useState(0)

  // Auto-scroll to bottom function with smooth behavior
  const scrollToBottom = useCallback((smooth = true) => {
    if (containerRef.current) {
      const scrollElement = containerRef.current.getElement()
      if (scrollElement) {
        const scrollContent = scrollElement.querySelector('.p-scrollpanel-content')
        if (scrollContent) {
          scrollContent.scrollTo({
            top: scrollContent.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto'
          })
          setIsUserAtBottom(true)
          setShowScrollButton(false)
        }
      }
    }
  }, [])

  // Handle scroll events to detect user position
  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const scrollElement = containerRef.current.getElement()
      if (scrollElement) {
        const scrollContent = scrollElement.querySelector('.p-scrollpanel-content')
        if (scrollContent) {
          const { scrollTop, scrollHeight, clientHeight } = scrollContent
          const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10 // 10px threshold
          setIsUserAtBottom(isAtBottom)
          setShowScrollButton(!isAtBottom && messageCount > 0)
        }
      }
    }
  }, [messageCount])

  // Callback for user scroll events (for external components)
  const onUserScroll = useCallback((info: { atBottom: boolean }) => {
    setIsUserAtBottom(info.atBottom)
  }, [])

  // Auto-scroll when container becomes visible
  useEffect(() => {
    if (isVisible && messageCount > 0) {
      // Small delay to ensure the container is fully rendered
      setTimeout(() => {
        // Use smooth scrolling if there are unread messages, otherwise instant
        const shouldSmoothScroll = hasUnreadMessages
        scrollToBottom(shouldSmoothScroll)
        setHasUnreadMessages(false)
        setLastSeenMessageCount(messageCount)
      }, 100)
    }
  }, [isVisible, hasUnreadMessages, messageCount, scrollToBottom])

  // Auto-scroll when new messages arrive (only if user is at bottom or container is visible)
  useEffect(() => {
    if (messageCount > lastSeenMessageCount) {
      if (isVisible) {
        if (autoStick && isUserAtBottom) {
          // User is at bottom, auto-scroll to new message
          setTimeout(() => scrollToBottom(true), 50)
        }
        setLastSeenMessageCount(messageCount)
        setHasUnreadMessages(false)
      } else {
        // Container is not visible, mark as having unread messages
        setHasUnreadMessages(true)
      }
    }
  }, [messageCount, isVisible, isUserAtBottom, lastSeenMessageCount, autoStick, scrollToBottom])

  // Auto-scroll for streaming content
  useEffect(() => {
    if (streamingContentLength > 0 && streamingContentRef.current) {
      const element = streamingContentRef.current
      element.scrollTop = element.scrollHeight
    }
  }, [streamingContentLength])

  // Set up scroll listener
  useEffect(() => {
    if (containerRef.current) {
      const scrollElement = containerRef.current.getElement()
      if (scrollElement) {
        const scrollContent = scrollElement.querySelector('.p-scrollpanel-content')
        if (scrollContent) {
          scrollContent.addEventListener('scroll', handleScroll)
          return () => scrollContent.removeEventListener('scroll', handleScroll)
        }
      }
    }
  }, [handleScroll])

  return {
    containerRef,
    streamingContentRef,
    atBottom: isUserAtBottom,
    scrollToBottom,
    onUserScroll,
    hasUnreadMessages,
    showScrollButton
  }
}