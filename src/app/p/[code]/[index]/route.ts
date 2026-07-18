import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

type TicketImages = {
  supporting_image_url: string | null
  supporting_image_urls: string[] | null
}

function imageList(ticket: TicketImages): string[] {
  if (Array.isArray(ticket.supporting_image_urls) && ticket.supporting_image_urls.length > 0) {
    return ticket.supporting_image_urls.filter(
      (value): value is string => typeof value === 'string' && Boolean(value.trim())
    )
  }
  return ticket.supporting_image_url ? [ticket.supporting_image_url] : []
}

/**
 * Short public photo links for Signal paste:
 *   /p/3/1         → photo 1 for ticket J2-3
 *   /p/J2-3/1
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ code: string; index: string }> }
) {
  try {
    const { code: rawCode, index: rawIndex } = await context.params
    const code = decodeURIComponent(rawCode || '').trim()
    const index = Number.parseInt(rawIndex, 10)
    if (!code || !Number.isFinite(index) || index < 1) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const admin = createServiceClient()
    const digits = code.replace(/\D/g, '').replace(/^0+/, '') || ''

    let ticket: TicketImages | null = null

    if (/^J2[-_]?\d+$/i.test(code) && digits) {
      const { data } = await admin
        .from('support_tickets')
        .select('supporting_image_url, supporting_image_urls')
        .ilike('ticket_number', `J2-${digits}`)
        .limit(1)
        .maybeSingle()
      ticket = data
    } else if (/^\d+$/.test(code) && digits) {
      const { data: j2 } = await admin
        .from('support_tickets')
        .select('supporting_image_url, supporting_image_urls')
        .ilike('ticket_number', `J2-${digits}`)
        .limit(1)
        .maybeSingle()
      if (j2) {
        ticket = j2
      } else {
        const padded = digits.padStart(6, '0')
        const { data: legacy } = await admin
          .from('support_tickets')
          .select('supporting_image_url, supporting_image_urls')
          .ilike('ticket_number', `%-${padded}`)
          .limit(1)
          .maybeSingle()
        ticket = legacy
      }
    } else if (/^TKT[-_]/i.test(code)) {
      const { data } = await admin
        .from('support_tickets')
        .select('supporting_image_url, supporting_image_urls')
        .ilike('ticket_number', code)
        .limit(1)
        .maybeSingle()
      ticket = data
    }

    if (!ticket) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const target = imageList(ticket)[index - 1]?.trim()
    if (!target) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    return NextResponse.redirect(target, 302)
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
