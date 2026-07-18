import type { KeyboardEvent } from 'react'

/** Enter submits the chat composer; Shift+Enter keeps a new line in textareas. */
export function isChatComposerSubmitKey(e: KeyboardEvent): boolean {
  if (e.shiftKey) return false
  if (e.nativeEvent.isComposing) return false
  if (e.nativeEvent.repeat) return false
  return e.key === 'Enter' || e.key === 'NumpadEnter'
}
