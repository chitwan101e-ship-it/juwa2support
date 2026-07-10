'use client'

import { useRef, type ReactNode } from 'react'

type TabId = string

/** Lazy-render inactive tabs: hidden panels reuse cached JSX instead of re-evaluating render(). */
export function StaffTabPanel({
  tab,
  activeTab,
  mountedTabs,
  className,
  render,
}: {
  tab: TabId
  activeTab: TabId
  mountedTabs: ReadonlySet<TabId>
  className?: string
  render: () => ReactNode
}) {
  const cacheRef = useRef<ReactNode>(null)
  const hasRenderedRef = useRef(false)

  if (!mountedTabs.has(tab)) return null
  const visible = activeTab === tab

  if (visible) {
    const content = render()
    cacheRef.current = content
    hasRenderedRef.current = true
    return <section className={className}>{content}</section>
  }

  if (!hasRenderedRef.current || cacheRef.current == null) return null

  return (
    <section
      hidden
      className="hidden [content-visibility:hidden] [contain:strict] pointer-events-none"
      aria-hidden
    >
      {cacheRef.current}
    </section>
  )
}

/** Same lazy-render pattern for a group of tabs that share one panel (e.g. inbox channels). */
export function StaffMultiTabPanel({
  tabs,
  activeTab,
  mountedTabs,
  isVisible,
  className,
  render,
}: {
  tabs: readonly TabId[]
  activeTab: TabId
  mountedTabs: ReadonlySet<TabId>
  isVisible: (tab: TabId) => boolean
  className?: string
  render: () => ReactNode
}) {
  const cacheRef = useRef<ReactNode>(null)
  const hasRenderedRef = useRef(false)

  const anyMounted = tabs.some((t) => mountedTabs.has(t))
  if (!anyMounted) return null
  const visible = isVisible(activeTab)

  if (visible) {
    const content = render()
    cacheRef.current = content
    hasRenderedRef.current = true
    return <section className={className}>{content}</section>
  }

  if (!hasRenderedRef.current || cacheRef.current == null) return null

  return (
    <section
      hidden
      className="hidden [content-visibility:hidden] [contain:strict] pointer-events-none"
      aria-hidden
    >
      {cacheRef.current}
    </section>
  )
}

/** Lazy-render Users sub-tabs (Pending / Active / Suspended). */
export function StaffUsersSubPanel({
  tab,
  activeTab,
  render,
}: {
  tab: string
  activeTab: string
  render: () => ReactNode
}) {
  const cacheRef = useRef<ReactNode>(null)
  const hasRenderedRef = useRef(false)
  const visible = activeTab === tab

  if (visible) {
    const content = render()
    cacheRef.current = content
    hasRenderedRef.current = true
    return <>{content}</>
  }

  if (!hasRenderedRef.current || cacheRef.current == null) return null

  return (
    <div hidden className="hidden [content-visibility:hidden] [contain:strict] pointer-events-none" aria-hidden>
      {cacheRef.current}
    </div>
  )
}
