'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Clipboard,
  Clock3,
  Copy,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Ticket as TicketIcon,
  User2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ChatMessageImage } from '@/components/ChatMessageImage'
import {
  customerDisplayName,
  displayTicketNumber,
  formatTicketForSignal,
  supportTicketStatusLabel,
  ticketImageUrls,
  type SupportTicket,
  type SupportTicketStatus,
} from '@/lib/supportTickets'

const TICKET_PAGE_SIZE = 50

function formatTicketDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function statusClass(status: SupportTicketStatus): string {
  return status === 'closed'
    ? 'border-slate-200 bg-slate-100 text-slate-600'
    : 'border-amber-200 bg-amber-50 text-amber-800'
}

export function TicketsSection({
  isActive,
  initialTicketId,
  onOpenCustomerChat,
}: {
  isActive: boolean
  initialTicketId?: string | null
  onOpenCustomerChat: (conversationId: string) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | SupportTicketStatus>('open')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<'number' | 'signal' | null>(null)
  const ticketsLengthRef = useRef(0)
  ticketsLengthRef.current = tickets.length
  const deepLinkDoneRef = useRef(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  const loadTickets = useCallback(
    async (options?: { append?: boolean; limit?: number }) => {
      try {
        const append = options?.append ?? false
        const params = new URLSearchParams()
        if (statusFilter !== 'all') params.set('status', statusFilter)
        if (debouncedQuery) params.set('q', debouncedQuery)
        params.set('limit', String(options?.limit ?? TICKET_PAGE_SIZE))
        params.set('offset', append ? String(ticketsLengthRef.current) : '0')

        const response = await fetch(`/api/staff/tickets?${params.toString()}`, {
          cache: 'no-store',
        })
        const json = (await response.json().catch(() => ({}))) as {
          tickets?: SupportTicket[]
          hasMore?: boolean
          error?: string
        }
        if (!response.ok) throw new Error(json.error || 'Could not load tickets.')
        const page = json.tickets ?? []
        setHasMore(Boolean(json.hasMore))
        setTickets((current) => (append ? [...current, ...page] : page))
        if (!append) {
          setSelectedTicketId((current) => {
            if (current && page.some((ticket) => ticket.id === current)) return current
            const desktop =
              typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
            return desktop ? (page[0]?.id ?? null) : null
          })
        }
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Could not load tickets.')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [debouncedQuery, statusFilter]
  )

  useEffect(() => {
    if (!isActive) return
    setLoading(true)
    void loadTickets()
  }, [isActive, loadTickets])

  useEffect(() => {
    if (!initialTicketId || deepLinkDoneRef.current) return
    deepLinkDoneRef.current = true
    void (async () => {
      const response = await fetch(
        `/api/staff/tickets?ticketId=${encodeURIComponent(initialTicketId)}`,
        { cache: 'no-store' }
      )
      const json = (await response.json().catch(() => ({}))) as { tickets?: SupportTicket[] }
      const linked = json.tickets?.[0]
      if (!linked) return
      setTickets((current) =>
        current.some((ticket) => ticket.id === linked.id) ? current : [linked, ...current]
      )
      setStatusFilter(linked.status)
      setSelectedTicketId(linked.id)
      setMobileDetailOpen(true)
    })()
  }, [initialTicketId])

  useEffect(() => {
    let reloadTimer: number | null = null
    const scheduleReload = () => {
      if (reloadTimer) window.clearTimeout(reloadTimer)
      reloadTimer = window.setTimeout(() => {
        reloadTimer = null
        void loadTickets({
          limit: Math.min(Math.max(ticketsLengthRef.current, TICKET_PAGE_SIZE), 100),
        })
      }, 700)
    }
    const channel = supabase
      .channel('tickets-section')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_tickets' },
        scheduleReload
      )
      .subscribe()
    return () => {
      if (reloadTimer) window.clearTimeout(reloadTimer)
      void supabase.removeChannel(channel)
    }
  }, [loadTickets, supabase])

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) ?? null
  const selectedImages = selectedTicket ? ticketImageUrls(selectedTicket) : []

  async function copyText(kind: 'number' | 'signal', text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      alert('Could not copy to clipboard. Select the text below and copy manually.')
    }
  }

  async function setTicketStatus(status: SupportTicketStatus) {
    if (!selectedTicket || busy) return
    if (status === 'closed') {
      const number = displayTicketNumber(selectedTicket.ticket_number)
      if (!window.confirm(`Close ticket ${number}?`)) return
    }
    const ticketId = selectedTicket.id
    setBusy(true)
    try {
      const response = await fetch('/api/staff/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, status }),
      })
      const json = (await response.json().catch(() => ({}))) as {
        ticket?: SupportTicket
        error?: string
      }
      if (!response.ok) throw new Error(json.error || 'Could not update ticket.')
      const updated = json.ticket
      if (!updated) {
        await loadTickets()
        return
      }

      // If the ticket no longer matches the active filter, drop it from this list
      // instead of leaving a closed ticket under Open (or open under Closed).
      if (statusFilter !== 'all' && statusFilter !== updated.status) {
        setTickets((current) => {
          const next = current.filter((ticket) => ticket.id !== updated.id)
          setSelectedTicketId((selected) => {
            if (selected !== updated.id) return selected
            return next[0]?.id ?? null
          })
          setMobileDetailOpen(false)
          return next
        })
        return
      }

      setTickets((current) =>
        current.map((ticket) => (ticket.id === updated.id ? updated : ticket))
      )
      setSelectedTicketId(updated.id)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not update ticket.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        className={`flex shrink-0 flex-wrap items-center justify-between gap-3 ${
          mobileDetailOpen ? 'max-lg:hidden' : ''
        }`}
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-600">
            Support tickets
          </p>
          <h3 className="text-xl font-bold tracking-tight text-slate-900">Tickets</h3>
          <p className="text-[12px] text-slate-500">
            Search by ticket number, then copy the details for Signal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadTickets()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.6fr)]">
        <aside
          className={`flex min-h-0 flex-col border-r border-slate-200 ${
            mobileDetailOpen ? 'max-lg:hidden' : ''
          }`}
        >
          <div className="space-y-2 border-b border-slate-200 p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search J2-3, name, username, issue…"
                autoFocus={isActive}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-8 pr-3 text-[13px] font-medium outline-none focus:border-violet-400"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ['open', 'Open'],
                  ['closed', 'Closed'],
                  ['all', 'All'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setStatusFilter(value)
                    setMobileDetailOpen(false)
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold min-h-[2rem] ${
                    statusFilter === value
                      ? 'bg-violet-100 text-violet-800'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="admin-inbox-scroll min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center p-8 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : tickets.length === 0 ? (
              <p className="p-6 text-center text-[12px] text-slate-500">
                {debouncedQuery
                  ? 'No tickets match that search.'
                  : 'No tickets yet. Create one from a customer chat.'}
              </p>
            ) : (
              tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => {
                    setSelectedTicketId(ticket.id)
                    setMobileDetailOpen(true)
                  }}
                  className={`block w-full border-b border-slate-100 p-3.5 text-left transition ${
                    selectedTicketId === ticket.id
                      ? 'border-l-2 border-l-violet-500 bg-violet-50'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-[13px] font-bold text-slate-900">
                      {customerDisplayName(ticket)}
                    </p>
                    <span
                      className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[8px] font-bold ${statusClass(ticket.status)}`}
                    >
                      {supportTicketStatusLabel(ticket.status)}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] font-semibold tracking-tight text-violet-700">
                    {displayTicketNumber(ticket.ticket_number)}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-600">
                    {ticket.game_username || `@${ticket.customer_username}`}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[10.5px] text-slate-500">{ticket.issue}</p>
                  {ticket.status === 'closed' && ticket.closed_at ? (
                    <p className="mt-1 text-[9px] font-medium text-slate-400">
                      Closed {formatTicketDate(ticket.closed_at)}
                    </p>
                  ) : null}
                </button>
              ))
            )}
            {!loading && hasMore ? (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => {
                  setLoadingMore(true)
                  void loadTickets({ append: true })
                }}
                className="block w-full p-3 text-center text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  'Load more'
                )}
              </button>
            ) : null}
          </div>
        </aside>

        <div
          className={`admin-inbox-scroll min-h-0 overflow-y-auto ${
            mobileDetailOpen ? '' : 'max-lg:hidden'
          }`}
        >
          {!selectedTicket ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">
              Select a ticket, or search by ticket number.
            </div>
          ) : (
            <div className="space-y-5 p-4 sm:p-5">
              <header className="border-b border-slate-200 pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => setMobileDetailOpen(false)}
                      className="lg:hidden inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      aria-label="Back to ticket list"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <TicketIcon className="h-5 w-5 text-violet-600 shrink-0" />
                    <h4 className="font-mono text-lg sm:text-xl font-bold tracking-tight text-slate-900 truncate">
                      {displayTicketNumber(selectedTicket.ticket_number)}
                    </h4>
                    <button
                      type="button"
                      onClick={() =>
                        void copyText(
                          'number',
                          displayTicketNumber(selectedTicket.ticket_number)
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                      title="Copy ticket number"
                    >
                      {copied === 'number' ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Clipboard className="h-3.5 w-3.5" />
                      )}
                      {copied === 'number' ? 'Copied' : 'Copy #'}
                    </button>
                  </div>
                  <span
                    className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ${statusClass(selectedTicket.status)}`}
                  >
                    {supportTicketStatusLabel(selectedTicket.status)}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void copyText('signal', formatTicketForSignal(selectedTicket))
                    }
                    className="inline-flex min-h-[2.75rem] items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[12px] font-semibold text-white hover:bg-violet-700"
                  >
                    {copied === 'signal' ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied === 'signal' ? 'Copied for Signal' : 'Copy for Signal'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenCustomerChat(selectedTicket.conversation_id)}
                    className="inline-flex min-h-[2.75rem] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Open chat
                  </button>
                  {selectedTicket.status === 'open' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setTicketStatus('closed')}
                      className="inline-flex min-h-[2.75rem] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Mark closed
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setTicketStatus('open')}
                      className="inline-flex min-h-[2.75rem] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </header>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2.5">
                  <span className="rounded-lg bg-violet-100 p-1.5 text-violet-700">
                    <User2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-violet-500">
                      Customer
                    </p>
                    <p className="truncate text-[12px] font-bold text-slate-900">
                      {selectedTicket.customer_name?.trim() ||
                        `@${selectedTicket.customer_username}`}
                    </p>
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
                  <span className="rounded-lg bg-emerald-100 p-1.5 text-emerald-700">
                    <User2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-emerald-600">
                      Username
                    </p>
                    <p className="truncate text-[12px] font-bold text-slate-900">
                      {selectedTicket.game_username || selectedTicket.customer_username}
                    </p>
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5">
                  <span className="rounded-lg bg-amber-100 p-1.5 text-amber-700">
                    <Clock3 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-amber-600">
                      When it happened
                    </p>
                    <p className="truncate text-[11px] font-semibold text-slate-800">
                      {selectedTicket.occurred_at
                        ? formatTicketDate(selectedTicket.occurred_at)
                        : 'Not provided'}
                    </p>
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2.5">
                  <span className="rounded-lg bg-sky-100 p-1.5 text-sky-700">
                    <TicketIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-sky-600">
                      {selectedTicket.status === 'closed' && selectedTicket.closed_at
                        ? 'Closed'
                        : 'Created'}
                    </p>
                    <p className="truncate text-[11px] font-semibold text-slate-800">
                      {selectedTicket.status === 'closed' && selectedTicket.closed_at
                        ? formatTicketDate(selectedTicket.closed_at)
                        : formatTicketDate(selectedTicket.created_at)}
                    </p>
                  </div>
                </div>
              </div>

              <section>
                <h5 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Issue
                </h5>
                <p className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-[13px] text-slate-800">
                  {selectedTicket.issue}
                </p>
              </section>

              {selectedImages.length > 0 ? (
                <section>
                  <h5 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Photos ({selectedImages.length})
                  </h5>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {selectedImages.map((imageUrl, index) => (
                      <ChatMessageImage
                        key={`${imageUrl}-${index}`}
                        imageUrl={imageUrl}
                        alt={`Photo ${index + 1} for ${displayTicketNumber(selectedTicket.ticket_number)}`}
                        className="h-36 w-full rounded-xl border border-slate-200 object-cover"
                        linkClassName="block cursor-zoom-in"
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              <pre className="overflow-x-auto rounded-xl border border-dashed border-violet-200 bg-violet-50/50 p-3 text-[11px] leading-relaxed text-slate-700">
                {formatTicketForSignal(selectedTicket)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
