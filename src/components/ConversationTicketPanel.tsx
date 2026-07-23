'use client'

import {
  type ChangeEvent,
  type ClipboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Check,
  Clipboard,
  ClipboardPaste,
  Copy,
  ImagePlus,
  Images,
  Loader2,
  Ticket as TicketIcon,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ChatMessageImage } from '@/components/ChatMessageImage'
import { downscaleImageFileToJpeg } from '@/lib/downscaleImageFile'
import {
  displayTicketNumber,
  formatTicketForSignal,
  parseDateTimeLocal,
  supportTicketStatusLabel,
  type SupportTicket,
  type SupportTicketStatus,
} from '@/lib/supportTickets'

function statusClass(status: SupportTicketStatus): string {
  return status === 'closed'
    ? 'border-slate-200 bg-slate-100 text-slate-600'
    : 'border-amber-200 bg-amber-50 text-amber-800'
}

/** Local datetime string (YYYY-MM-DDTHH:mm) for the datetime-local input default. */
function nowForDateTimeInput(): string {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

type ExistingChatImage = {
  id: string
  imageUrl: string
  createdAt: string
}

type TicketAttachment =
  | { id: string; kind: 'upload'; blob: Blob; previewUrl: string }
  | { id: string; kind: 'chat'; imageUrl: string }

const MAX_TICKET_IMAGES = 10

export function ConversationTicketPanel({
  conversationId,
  staffId,
  canCreate,
  defaultGameUsername,
  existingChatImages = [],
  onTicketChanged,
}: {
  conversationId: string
  staffId: string
  canCreate: boolean
  defaultGameUsername?: string | null
  existingChatImages?: ExistingChatImage[]
  onTicketChanged?: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [issue, setIssue] = useState('')
  const [gameUsername, setGameUsername] = useState('')
  const [occurredAt, setOccurredAt] = useState('')
  const [attachments, setAttachments] = useState<TicketAttachment[]>([])
  const [busy, setBusy] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const creatingRef = useRef(false)

  function openCreateModal() {
    for (const attachment of attachments) {
      if (attachment.kind === 'upload') URL.revokeObjectURL(attachment.previewUrl)
    }
    setAttachments([])
    setIssue('')
    setGameUsername(defaultGameUsername?.trim() ?? '')
    setOccurredAt(nowForDateTimeInput())
    setModalOpen(true)
  }

  const loadTickets = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/staff/tickets?conversationId=${encodeURIComponent(conversationId)}`,
        { cache: 'no-store' }
      )
      const json = (await response.json().catch(() => ({}))) as {
        tickets?: SupportTicket[]
        error?: string
      }
      if (!response.ok) throw new Error(json.error || 'Could not load tickets.')
      setTickets(json.tickets ?? [])
    } catch (error) {
      console.error('[tickets] load:', error)
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    void loadTickets()
  }, [loadTickets])

  useEffect(() => {
    const channel = supabase
      .channel(`support-ticket-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'support_tickets',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => void loadTickets()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [conversationId, loadTickets, supabase])

  const latestTicket = tickets[0] ?? null

  async function addImageFiles(files: File[]) {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    const availableSlots = MAX_TICKET_IMAGES - attachments.length
    if (availableSlots <= 0) {
      alert(`A ticket can include up to ${MAX_TICKET_IMAGES} photos.`)
      return
    }
    if (imageFiles.length > availableSlots) {
      alert(`Only the first ${availableSlots} photo(s) were added. Limit is ${MAX_TICKET_IMAGES}.`)
    }
    try {
      const prepared = await Promise.all(
        imageFiles.slice(0, availableSlots).map(async (file) => {
          const blob = await downscaleImageFileToJpeg(file, { maxDim: 1600, quality: 0.86 })
          return {
            id: crypto.randomUUID(),
            kind: 'upload' as const,
            blob,
            previewUrl: URL.createObjectURL(blob),
          }
        })
      )
      setAttachments((current) => [...current, ...prepared].slice(0, MAX_TICKET_IMAGES))
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not prepare image.')
    }
  }

  async function onImagePick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length > 0) await addImageFiles(files)
  }

  async function onPasteImages(event: ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith('image/')
    )
    if (files.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    // Some browsers expose the same clipboard image more than once — keep unique blobs.
    const unique: File[] = []
    const seen = new Set<string>()
    for (const file of files) {
      const key = `${file.name}|${file.size}|${file.type}|${file.lastModified}`
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(file)
    }
    await addImageFiles(unique)
  }

  function toggleChatImage(image: ExistingChatImage) {
    setAttachments((current) => {
      const existing = current.find(
        (attachment) => attachment.kind === 'chat' && attachment.id === image.id
      )
      if (existing) return current.filter((attachment) => attachment !== existing)
      if (current.length >= MAX_TICKET_IMAGES) {
        alert(`A ticket can include up to ${MAX_TICKET_IMAGES} photos.`)
        return current
      }
      return [...current, { id: image.id, kind: 'chat', imageUrl: image.imageUrl }]
    })
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id)
      if (removed?.kind === 'upload') URL.revokeObjectURL(removed.previewUrl)
      return current.filter((attachment) => attachment.id !== id)
    })
  }

  async function createTicket() {
    if (creatingRef.current || busy) return
    const cleanIssue = issue.trim()
    const cleanUsername = gameUsername.trim().replace(/^@+/, '')
    if (!cleanUsername) {
      alert('Enter the customer’s game username.')
      return
    }
    const occurredDate = parseDateTimeLocal(occurredAt)
    if (!occurredDate) {
      alert('Enter the date and time when the issue happened.')
      return
    }
    if (!cleanIssue) {
      alert('Describe the issue.')
      return
    }
    creatingRef.current = true
    setBusy(true)
    try {
      const supportingImageUrls = await Promise.all(
        attachments.map(async (attachment) => {
          if (attachment.kind === 'chat') return attachment.imageUrl
          const path = `${staffId}/${conversationId}/ticket-${crypto.randomUUID()}.jpg`
          const { error } = await supabase.storage
            .from('message-images')
            .upload(path, attachment.blob, {
              contentType: 'image/jpeg',
              upsert: false,
            })
          if (error) throw error
          return supabase.storage.from('message-images').getPublicUrl(path).data.publicUrl
        })
      )

      const response = await fetch('/api/staff/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          issue: cleanIssue,
          gameUsername: cleanUsername,
          occurredAt: occurredDate.toISOString(),
          supportingImageUrls,
        }),
      })
      const json = (await response.json().catch(() => ({}))) as {
        ticket?: SupportTicket
        error?: string
      }
      if (!response.ok) throw new Error(json.error || 'Could not create ticket.')

      setModalOpen(false)
      setIssue('')
      for (const attachment of attachments) {
        if (attachment.kind === 'upload') URL.revokeObjectURL(attachment.previewUrl)
      }
      setAttachments([])
      await loadTickets()
      onTicketChanged?.()

      if (json.ticket) {
        try {
          await navigator.clipboard.writeText(formatTicketForSignal(json.ticket))
          setCopiedId(json.ticket.id)
          window.setTimeout(() => setCopiedId(null), 2500)
        } catch {
          alert(
            `Ticket ${displayTicketNumber(json.ticket.ticket_number)} created, but clipboard copy failed. Use Copy for Signal.`
          )
        }
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not create ticket.')
    } finally {
      creatingRef.current = false
      setBusy(false)
    }
  }

  async function copyTicket(ticket: SupportTicket) {
    await navigator.clipboard.writeText(formatTicketForSignal(ticket))
    setCopiedId(ticket.id)
    window.setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <>
      {loading || latestTicket || canCreate ? (
      <div className="border-b border-slate-200 bg-slate-50/80 px-2.5 sm:px-3 py-1.5 sm:py-2">
        {loading ? (
          <p className="inline-flex items-center gap-1.5 text-[10px] text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading tickets…
          </p>
        ) : latestTicket ? (
          <div className="flex flex-nowrap items-center gap-1.5 sm:gap-2 overflow-x-auto">
            <TicketIcon className="h-4 w-4 shrink-0 text-violet-600" />
            <span className="font-mono text-[11px] font-bold text-slate-900 shrink-0">
              {displayTicketNumber(latestTicket.ticket_number)}
            </span>
            <span
              className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold shrink-0 ${statusClass(latestTicket.status)}`}
            >
              {supportTicketStatusLabel(latestTicket.status)}
            </span>
            <button
              type="button"
              onClick={() => void copyTicket(latestTicket)}
              className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-800 hover:bg-violet-100 shrink-0"
              title="Copy ticket details for Signal"
            >
              {copiedId === latestTicket.id ? (
                <>
                  <Check className="h-3 w-3" /> <span className="hidden sm:inline">Copied for Signal</span>
                  <span className="sm:hidden">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> <span className="hidden sm:inline">Copy for Signal</span>
                  <span className="sm:hidden">Copy</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard.writeText(displayTicketNumber(latestTicket.ticket_number))
              }
              className="hidden sm:inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 shrink-0"
              title="Copy ticket number only"
            >
              <Clipboard className="h-3 w-3" />
              Copy #
            </button>
            {canCreate ? (
              <button
                type="button"
                onClick={openCreateModal}
                className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <TicketIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New ticket</span>
                <span className="sm:hidden">New</span>
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10.5px] text-slate-500 hidden sm:block">
              Create a ticket to copy into Signal (number, username, when, issue, photos).
            </p>
            <p className="text-[10.5px] text-slate-500 sm:hidden truncate min-w-0">
              Ticket for Signal
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-violet-800 hover:bg-violet-100"
            >
              <TicketIcon className="h-3.5 w-3.5" />
              Create ticket
            </button>
          </div>
        )}
      </div>
      ) : null}

      {modalOpen ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ticket-modal-title"
          onClick={() => {
            if (!busy) setModalOpen(false)
          }}
        >
          <div
            className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            onPaste={(event) => void onPasteImages(event)}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="ticket-modal-title" className="text-base font-bold text-slate-900">
                  Create ticket
                </h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  After create, details are copied for Signal. Add photos from upload, paste, or
                  this customer’s chat.
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-700">Username</span>
                <input
                  type="text"
                  value={gameUsername}
                  onChange={(event) => setGameUsername(event.target.value)}
                  maxLength={120}
                  placeholder="Customer’s game username"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900 outline-none focus:border-violet-400"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-700">When did it happen</span>
                <input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(event) => setOccurredAt(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900 outline-none focus:border-violet-400"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-[11px] font-semibold text-slate-700">Issue</span>
              <textarea
                value={issue}
                onChange={(event) => setIssue(event.target.value)}
                maxLength={4000}
                placeholder="Describe the issue for Signal / technical follow-up…"
                className="mt-1.5 min-h-36 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-[13px] text-slate-900 outline-none focus:border-violet-400"
              />
            </label>

            <section className="space-y-3">
              <div>
                <p className="text-[11px] font-semibold text-slate-700">
                  Photos ({attachments.length}/{MAX_TICKET_IMAGES})
                </p>
                <p className="text-[10px] text-slate-500">
                  Three ways to add photos — Upload is only for files on this computer.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 hover:border-violet-300 hover:bg-violet-50/40">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-800">
                    <ImagePlus className="h-4 w-4 text-violet-600" />
                    1. From this computer
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Opens your file picker (desktop / downloads).
                  </span>
                  <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700">
                    Choose files
                  </span>
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => void onImagePick(event)}
                  />
                </label>

                <div
                  className="flex flex-col gap-1 rounded-xl border border-dashed border-violet-300 bg-violet-50/50 px-3 py-3"
                  onPaste={(event) => void onPasteImages(event)}
                  tabIndex={0}
                  role="group"
                  aria-label="Paste screenshot area"
                >
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-800">
                    <ClipboardPaste className="h-4 w-4 text-violet-600" />
                    2. Paste a screenshot
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Copy an image, click here, then press Ctrl+V (Cmd+V on Mac).
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <div className="mb-2 flex items-center gap-1.5">
                  <Images className="h-4 w-4 text-violet-600" />
                  <p className="text-[11px] font-semibold text-slate-800">
                    3. From this chat’s history
                  </p>
                </div>
                {existingChatImages.length > 0 ? (
                  <>
                    <p className="mb-2 text-[10px] text-slate-500">
                      Tap a photo below to attach it to the ticket.
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {existingChatImages.map((chatImage) => {
                        const selected = attachments.some(
                          (attachment) =>
                            attachment.kind === 'chat' && attachment.id === chatImage.id
                        )
                        return (
                          <button
                            key={chatImage.id}
                            type="button"
                            onClick={() => toggleChatImage(chatImage)}
                            className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 bg-slate-100 ${
                              selected
                                ? 'border-violet-600 ring-2 ring-violet-200'
                                : 'border-slate-200'
                            }`}
                            title={`Chat image · ${new Date(chatImage.createdAt).toLocaleString()}`}
                          >
                            <ChatMessageImage
                              imageUrl={chatImage.imageUrl}
                              alt="Chat attachment"
                              className="h-full w-full object-cover"
                              interactive={false}
                            />
                            {selected ? (
                              <span className="absolute inset-x-0 bottom-0 bg-violet-600 py-0.5 text-[9px] font-bold text-white">
                                Added
                              </span>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[10px] text-slate-500">
                    No photos in this chat yet. When the customer (or staff) sends an image
                    here, it will show up for one-tap attach.
                  </p>
                )}
              </div>

              {attachments.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold text-slate-600">
                    Attached to this ticket
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {attachments.map((attachment, index) => (
                      <div
                        key={attachment.id}
                        className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                      >
                        {attachment.kind === 'upload' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={attachment.previewUrl}
                            alt={`Photo ${index + 1}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <ChatMessageImage
                            imageUrl={attachment.imageUrl}
                            alt={`Photo ${index + 1}`}
                            className="h-full w-full object-cover"
                            interactive={false}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachment(attachment.id)}
                          className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-black"
                          aria-label={`Remove photo ${index + 1}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] text-slate-500">Photos optional. Ticket # is assigned automatically.</p>
              <button
                type="button"
                disabled={busy || !issue.trim() || !gameUsername.trim() || !occurredAt}
                onClick={() => void createTicket()}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[12px] font-semibold text-white hover:bg-violet-700 disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <TicketIcon className="h-4 w-4" />}
                Create & copy for Signal
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
