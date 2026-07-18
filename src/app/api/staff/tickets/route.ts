import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaffApi } from '@/lib/staffApiAuth'
import { parseDateTimeLocal } from '@/lib/supportTickets'

const TICKET_SELECT =
  'id, ticket_number, business_id, conversation_id, source_inbox, customer_id, customer_username, customer_name, game_username, occurred_at, issue, supporting_image_url, supporting_image_urls, status, created_by, created_at, closed_at, updated_at'

const TICKET_STATUSES = ['open', 'closed'] as const
type TicketStatus = (typeof TICKET_STATUSES)[number]

const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 50

function normalizeTicketRow<T extends { supporting_image_urls?: string[] | null; supporting_image_url?: string | null }>(
  ticket: T
): T & { supporting_image_urls: string[] } {
  const urls =
    Array.isArray(ticket.supporting_image_urls) && ticket.supporting_image_urls.length > 0
      ? ticket.supporting_image_urls.filter(
          (value): value is string => typeof value === 'string' && Boolean(value.trim())
        )
      : ticket.supporting_image_url
        ? [ticket.supporting_image_url]
        : []
  return { ...ticket, supporting_image_urls: urls }
}

export async function GET(req: NextRequest) {
  try {
    const result = await requireStaffApi(['admin', 'support'])
    if (!result.ok) return result.response
    const { auth } = result

    const params = req.nextUrl.searchParams
    const conversationId = params.get('conversationId')?.trim()
    const ticketId = params.get('ticketId')?.trim()
    const status = params.get('status')?.trim()
    const sourceInbox = params.get('sourceInbox')?.trim()
    const searchRaw = params.get('q')?.trim().replace(/^#+/, '').slice(0, 80) ?? ''
    const limit = Math.min(
      Math.max(Number(params.get('limit')) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    )
    const offset = Math.max(Number(params.get('offset')) || 0, 0)

    const admin = createServiceClient()

    // Exact / prefix ticket-number hit first so search feels instant for Signal tracking.
    if (searchRaw && !ticketId && !conversationId) {
      const normalized = searchRaw.replace(/[,()]/g, ' ').trim()
      if (normalized) {
        const upper = normalized.toUpperCase()
        const digitsOnly = normalized.replace(/\D/g, '')
        const looksLikeNumber =
          /^J2[-_]?\d+/i.test(normalized) ||
          /^TKT[-_]?\d/i.test(normalized) ||
          /^\d+$/.test(digitsOnly)

        if (looksLikeNumber) {
          const digits = digitsOnly.replace(/^0+/, '') || digitsOnly
          const patterns = [
            upper.startsWith('J2') ? `${upper}%` : null,
            digits ? `J2-${digits}` : null,
            digits ? `%${digits}` : null,
            upper.startsWith('TKT') ? `${upper}%` : null,
            `%${upper}%`,
          ].filter((p): p is string => Boolean(p))

          for (const pattern of patterns) {
            let numberQuery = admin
              .from('support_tickets')
              .select(TICKET_SELECT)
              .eq('business_id', auth.businessId)
              .ilike('ticket_number', pattern)
              .order('created_at', { ascending: false })
              .limit(limit)
            if (status && (TICKET_STATUSES as readonly string[]).includes(status)) {
              numberQuery = numberQuery.eq('status', status as TicketStatus)
            }
            if (sourceInbox === 'app' || sourceInbox === 'website') {
              numberQuery = numberQuery.eq('source_inbox', sourceInbox)
            }
            const { data: numberHits, error: numberError } = await numberQuery
            if (numberError) {
              return NextResponse.json({ error: numberError.message }, { status: 500 })
            }
            if (numberHits && numberHits.length > 0) {
              return NextResponse.json({
                tickets: numberHits.map((ticket) => normalizeTicketRow(ticket)),
                hasMore: false,
              })
            }
          }
        }
      }
    }

    let query = admin
      .from('support_tickets')
      .select(TICKET_SELECT)
      .eq('business_id', auth.businessId)
      .order('created_at', { ascending: false })

    if (conversationId) query = query.eq('conversation_id', conversationId)
    if (ticketId) query = query.eq('id', ticketId)
    if (sourceInbox === 'app' || sourceInbox === 'website') {
      query = query.eq('source_inbox', sourceInbox)
    }
    if (status && (TICKET_STATUSES as readonly string[]).includes(status)) {
      query = query.eq('status', status as TicketStatus)
    }
    if (searchRaw) {
      const term = searchRaw.replace(/[,()]/g, ' ').trim()
      if (term) {
        const pattern = `%${term}%`
        query = query.or(
          `ticket_number.ilike.${pattern},customer_username.ilike.${pattern},customer_name.ilike.${pattern},game_username.ilike.${pattern},issue.ilike.${pattern}`
        )
      }
    }

    query = query.range(offset, offset + limit)

    const { data: rows, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const hasMore = (rows ?? []).length > limit
    const tickets = (rows ?? []).slice(0, limit).map((ticket) => normalizeTicketRow(ticket))

    return NextResponse.json({ tickets, hasMore })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Support or admin creates a ticket for Signal handoff tracking. */
export async function POST(req: NextRequest) {
  try {
    const result = await requireStaffApi(['admin', 'support'])
    if (!result.ok) return result.response
    const { auth } = result

    const body = (await req.json()) as {
      conversationId?: string
      issue?: string
      gameUsername?: string
      occurredAt?: string
      supportingImageUrl?: string | null
      supportingImageUrls?: string[]
    }
    const conversationId = body.conversationId?.trim()
    const issue = body.issue?.trim()
    const gameUsername = body.gameUsername?.trim().replace(/^@+/, '')
    const occurredAtRaw = body.occurredAt?.trim()
    const supportingImageUrl = body.supportingImageUrl?.trim() || null
    const supportingImageUrls = Array.from(
      new Set(
        (body.supportingImageUrls ?? [])
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter(Boolean)
      )
    )

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    }
    if (!issue || issue.length > 4000) {
      return NextResponse.json(
        { error: 'Issue is required and must be 4,000 characters or fewer.' },
        { status: 400 }
      )
    }
    if (!gameUsername || gameUsername.length > 120) {
      return NextResponse.json(
        { error: 'Username is required (120 characters or fewer).' },
        { status: 400 }
      )
    }
    const occurredAt =
      parseDateTimeLocal(occurredAtRaw || '') ||
      (occurredAtRaw ? new Date(occurredAtRaw) : null)
    if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
      return NextResponse.json(
        { error: 'Date and time of the issue are required.' },
        { status: 400 }
      )
    }
    if (supportingImageUrls.length > 10) {
      return NextResponse.json(
        { error: 'A ticket can include up to 10 photos.' },
        { status: 400 }
      )
    }

    const admin = createServiceClient()
    const { data: conversation, error: conversationError } = await admin
      .from('conversations')
      .select('id, business_id, customer_id')
      .eq('id', conversationId)
      .single()

    if (conversationError || !conversation || conversation.business_id !== auth.businessId) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })
    }

    const { data: channel } = await admin.rpc('conversation_support_channel', {
      p_conversation_id: conversationId,
    })
    const sourceInbox = channel === 'app' ? 'app' : 'website'

    const { data: customer, error: customerError } = await admin
      .from('profiles')
      .select('id, username, first_name, last_name')
      .eq('id', conversation.customer_id)
      .single()

    if (customerError || !customer) {
      return NextResponse.json({ error: 'Customer profile not found.' }, { status: 404 })
    }

    const customerName = [customer.first_name, customer.last_name]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)
      .join(' ')

    const imageUrls =
      supportingImageUrls.length > 0
        ? supportingImageUrls
        : supportingImageUrl
          ? [supportingImageUrl]
          : []

    const { data: ticket, error: ticketError } = await admin
      .from('support_tickets')
      .insert({
        ticket_number: '',
        business_id: auth.businessId,
        conversation_id: conversationId,
        source_inbox: sourceInbox,
        customer_id: conversation.customer_id,
        customer_username: customer.username || 'customer',
        customer_name: customerName || null,
        game_username: gameUsername,
        occurred_at: occurredAt.toISOString(),
        issue,
        supporting_image_url: imageUrls[0] ?? null,
        supporting_image_urls: imageUrls,
        context_snapshot: [],
        status: 'open',
        created_by: auth.userId,
      })
      .select(TICKET_SELECT)
      .single()

    if (ticketError) return NextResponse.json({ error: ticketError.message }, { status: 500 })

    const { error: messageError } = await admin.from('messages').insert({
      conversation_id: conversationId,
      sender_id: auth.userId,
      body: `[Ticket created: ${ticket.ticket_number}]\n${issue}`,
      is_internal: true,
    })
    if (messageError) {
      console.error('[tickets] internal create marker failed:', messageError.message)
    }

    return NextResponse.json({ ok: true, ticket: normalizeTicketRow(ticket) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const result = await requireStaffApi(['admin', 'support'])
    if (!result.ok) return result.response
    const { auth } = result

    const body = (await req.json()) as { ticketId?: string; status?: TicketStatus }
    const ticketId = body.ticketId?.trim()
    if (!ticketId || !body.status || !(TICKET_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: 'ticketId and status (open|closed) are required.' }, { status: 400 })
    }

    const admin = createServiceClient()
    const { data: ticket } = await admin
      .from('support_tickets')
      .select('id, business_id, status')
      .eq('id', ticketId)
      .single()
    if (!ticket || ticket.business_id !== auth.businessId) {
      return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
    }

    if (ticket.status === body.status) {
      const { data: current } = await admin
        .from('support_tickets')
        .select(TICKET_SELECT)
        .eq('id', ticketId)
        .single()
      return NextResponse.json({
        ok: true,
        ticket: current ? normalizeTicketRow(current) : null,
      })
    }

    const now = new Date().toISOString()
    const { data: updated, error } = await admin
      .from('support_tickets')
      .update({
        status: body.status,
        closed_at: body.status === 'closed' ? now : null,
        closed_by: body.status === 'closed' ? auth.userId : null,
      })
      .eq('id', ticketId)
      .eq('status', ticket.status)
      .select(TICKET_SELECT)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!updated) {
      return NextResponse.json(
        { error: 'Ticket was updated by someone else. Refresh and try again.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ ok: true, ticket: normalizeTicketRow(updated) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
