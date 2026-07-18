import { createClient } from '@/lib/supabase/client'

type SupabaseBrowserClient = ReturnType<typeof createClient>

/** Unread inbound (staff) messages across all of the customer's conversations. */
export async function countUnreadStaffMessages(
  supabase: SupabaseBrowserClient,
  customerId: string
): Promise<{ count: number; error: string | null }> {
  const { data: convos, error: cErr } = await supabase
    .from('conversations')
    .select('id')
    .eq('customer_id', customerId)

  if (cErr) return { count: 0, error: cErr.message }
  const ids = (convos || []).map((c) => (c as { id: string }).id)
  if (ids.length === 0) return { count: 0, error: null }

  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .in('conversation_id', ids)
    .neq('sender_id', customerId)
    .or('read.is.false,read.is.null')

  if (error) return { count: 0, error: error.message }
  return { count: count ?? 0, error: null }
}

export type ChatPreview = {
  conversationId: string
  businessId: string
  lastBody: string
  lastAt: string
  lastSenderIsCustomer: boolean
  unreadFromTeam: number
}

/** Last message + unread counts per conversation for the customer inbox list. */
export async function loadCustomerChatPreviews(
  supabase: SupabaseBrowserClient,
  customerId: string
): Promise<{ previews: Map<string, ChatPreview>; error: string | null }> {
  const { data: convos, error: cErr } = await supabase
    .from('conversations')
    .select('id, business_id')
    .eq('customer_id', customerId)

  if (cErr) return { previews: new Map(), error: cErr.message }
  const list = (convos || []) as { id: string; business_id: string }[]
  if (list.length === 0) return { previews: new Map(), error: null }

  const convIds = list.map((c) => c.id)
  const convMeta = new Map(list.map((c) => [c.id, c]))

  const { data: msgs, error: mErr } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at, read, image_url')
    .in('conversation_id', convIds)

  if (mErr) return { previews: new Map(), error: mErr.message }

  type M = {
    conversation_id: string
    sender_id: string
    body: string
    created_at: string
    read: boolean | null
    image_url?: string | null
  }

  const rows = (msgs || []) as M[]

  const latestByConvo = new Map<string, M>()
  for (const m of rows) {
    const cur = latestByConvo.get(m.conversation_id)
    if (!cur || new Date(m.created_at) > new Date(cur.created_at)) latestByConvo.set(m.conversation_id, m)
  }

  const unreadStaffByConvo = new Map<string, number>()
  for (const m of rows) {
    if (m.sender_id === customerId) continue
    if (m.read === true) continue
    unreadStaffByConvo.set(m.conversation_id, (unreadStaffByConvo.get(m.conversation_id) || 0) + 1)
  }

  const previews = new Map<string, ChatPreview>()
  for (const [convoId, meta] of convMeta) {
    const last = latestByConvo.get(convoId)
    const unread = unreadStaffByConvo.get(convoId) || 0
    if (!last) {
      previews.set(meta.business_id, {
        conversationId: convoId,
        businessId: meta.business_id,
        lastBody: 'No messages yet',
        lastAt: new Date(0).toISOString(),
        lastSenderIsCustomer: false,
        unreadFromTeam: unread,
      })
      continue
    }
    const body =
      last.image_url && (!last.body?.trim() || last.body === '📷')
        ? '📷 Photo'
        : (last.body || '').trim() || (last.image_url ? '📷 Photo' : 'Message')
    previews.set(meta.business_id, {
      conversationId: convoId,
      businessId: meta.business_id,
      lastBody: body.slice(0, 80),
      lastAt: last.created_at,
      lastSenderIsCustomer: last.sender_id === customerId,
      unreadFromTeam: unread,
    })
  }

  return { previews, error: null }
}
