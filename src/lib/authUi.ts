/** Shared auth form styles — matches login / signup cards. */
import type { PointerEvent } from 'react'

export const AUTH_INPUT =
  'w-full px-3 py-2.5 border border-white/10 bg-[#111111] text-white placeholder:text-[#5c6478] rounded-lg text-sm focus:border-[#d4af37]/60 focus:ring-2 focus:ring-[#d4af37]/15 focus:outline-none transition-colors'

export const AUTH_LABEL = 'block text-[11px] font-medium text-[#8b96b8] uppercase tracking-wider mb-1.5'

/** Primary auth buttons — avoids 300ms tap delay on mobile. */
export const AUTH_BUTTON = 'touch-manipulation select-none'

/**
 * Run the auth action on pointerdown so the first tap works even when an input
 * still has focus. preventDefault alone (without running the action) can swallow
 * the first click on submit buttons in some browsers.
 */
export function runAuthButtonAction(
  e: PointerEvent<HTMLButtonElement>,
  action: () => void
) {
  if (e.button !== 0) return
  const btn = e.currentTarget
  if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return
  e.preventDefault()
  action()
}
