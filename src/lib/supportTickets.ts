export type SupportTicketStatus = 'open' | 'closed'

export type SupportTicket = {
  id: string
  ticket_number: string
  business_id: string
  conversation_id: string
  source_inbox: 'app' | 'website'
  customer_id: string
  customer_username: string
  /** Customer first + last name (for Signal header). */
  customer_name: string | null
  game_username: string | null
  occurred_at: string | null
  issue: string
  supporting_image_url: string | null
  supporting_image_urls: string[]
  status: SupportTicketStatus
  created_by: string | null
  created_at: string
  closed_at: string | null
  updated_at: string
}

export function supportTicketStatusLabel(status: SupportTicketStatus): string {
  return status === 'closed' ? 'Closed' : 'Open'
}

export function ticketImageUrls(ticket: SupportTicket): string[] {
  if (ticket.supporting_image_urls?.length) return ticket.supporting_image_urls
  if (ticket.supporting_image_url) return [ticket.supporting_image_url]
  return []
}

/** Short numeric id from J2-3 or TKT-…-000003 → "3" */
export function ticketShortCode(ticketNumber: string): string {
  const match = ticketNumber.trim().match(/(\d+)$/)
  if (!match) return ticketNumber.trim()
  return String(Number.parseInt(match[1], 10))
}

/** Display ticket # for staff — always the easy J2-n form when possible. */
export function displayTicketNumber(ticketNumber: string): string {
  const trimmed = ticketNumber.trim()
  const short = ticketShortCode(trimmed)
  if (/^\d+$/.test(short)) return `J2-${short}`
  return trimmed
}

/** Short photo URL for Signal, e.g. https://host/p/3/1 */
export function shortTicketPhotoUrl(
  ticketNumber: string,
  photoIndex1Based: number,
  siteOrigin?: string
): string {
  const origin =
    (siteOrigin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(
      /\/$/,
      ''
    ) || ''
  const code = encodeURIComponent(ticketShortCode(ticketNumber))
  const path = `/p/${code}/${photoIndex1Based}`
  return origin ? `${origin}${path}` : path
}

export function customerDisplayName(ticket: SupportTicket): string {
  const named = ticket.customer_name?.trim()
  if (named) return named
  const user = ticket.customer_username?.trim()
  return user ? `@${user}` : 'Customer'
}

/**
 * Parse `<input type="datetime-local">` values reliably (Safari-safe).
 * Returns null when the value is missing or invalid.
 */
export function parseDateTimeLocal(value: string): Date | null {
  const raw = value.trim()
  if (!raw) return null
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (match) {
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      match[6] ? Number(match[6]) : 0,
      0
    )
    return Number.isNaN(date.getTime()) ? null : date
  }
  const fallback = new Date(raw)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

/** Plain text block for pasting into Signal (or any chat). */
export function formatTicketForSignal(ticket: SupportTicket, siteOrigin?: string): string {
  const when = ticket.occurred_at
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(ticket.occurred_at))
    : 'Not provided'
  const username = ticket.game_username?.trim() || ticket.customer_username
  const images = ticketImageUrls(ticket)
  const origin =
    siteOrigin || (typeof window !== 'undefined' ? window.location.origin : undefined)
  const ticketNo = displayTicketNumber(ticket.ticket_number)

  const lines = [
    `Ticket: ${ticketNo}`,
    `Username: ${username}`,
    `When: ${when}`,
    `Issue:`,
    ticket.issue.trim(),
  ]
  if (images.length > 0) {
    lines.push('', 'Photos:')
    images.forEach((_, index) => {
      lines.push(shortTicketPhotoUrl(ticket.ticket_number, index + 1, origin))
    })
  }
  return lines.join('\n')
}
