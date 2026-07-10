import type { SupabaseClient } from '@supabase/supabase-js'

export const CONVO_LIST_PAGE_SIZE = 1000
export const INBOX_PREVIEW_CHUNK = 500
export const INBOX_QUERY_CHUNK = 200
export const INBOX_LIST_DEFAULT_MAX = 300

export type BusinessConversationRow = {
  id: string
  customer_id: string
  updated_at: string
  staff_game_username?: string | null
}

/** Load support threads for a business (paginated, optional cap). */
export async function fetchAllBusinessConversations(
  client: SupabaseClient,
  businessId: string,
  opts?: { maxRows?: number }
): Promise<BusinessConversationRow[]> {
  const maxRows = opts?.maxRows
  const rows: BusinessConversationRow[] = []
  let from = 0
  while (true) {
    const pageSize =
      maxRows != null ? Math.min(CONVO_LIST_PAGE_SIZE, maxRows - rows.length) : CONVO_LIST_PAGE_SIZE
    if (maxRows != null && pageSize <= 0) break

    const { data, error } = await client
      .from('conversations')
      .select('id, customer_id, updated_at, staff_game_username')
      .eq('business_id', businessId)
      .order('updated_at', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    for (const row of data) {
      rows.push(row as BusinessConversationRow)
    }
    if (maxRows != null && rows.length >= maxRows) break
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

/** Unread inbound customer messages per conversation (chunked RPC, legacy fallback). */
export async function fetchInboxUnreadCounts(
  client: SupabaseClient,
  convoRows: BusinessConversationRow[]
): Promise<Record<string, number>> {
  const unreadByConvo: Record<string, number> = {}
  const convIds = convoRows.map((r) => r.id)
  if (convIds.length === 0) return unreadByConvo

  for (let i = 0; i < convIds.length; i += INBOX_PREVIEW_CHUNK) {
    const slice = convIds.slice(i, i + INBOX_PREVIEW_CHUNK)
    const { data: counts, error: rpcErr } = await client.rpc('inbox_unread_customer_counts', {
      p_conversation_ids: slice,
    })
    if (rpcErr) {
      Object.assign(unreadByConvo, await fetchInboxUnreadCountsLegacy(client, convoRows, slice))
      continue
    }
    for (const row of counts || []) {
      const r = row as { conversation_id: string; unread_count: number | string }
      unreadByConvo[r.conversation_id] = Number(r.unread_count) || 0
    }
  }
  return unreadByConvo
}

/** Fallback when inbox_unread_customer_counts RPC is missing. */
async function fetchInboxUnreadCountsLegacy(
  client: SupabaseClient,
  convoRows: BusinessConversationRow[],
  convIds: string[]
): Promise<Record<string, number>> {
  const unreadByConvo: Record<string, number> = {}
  const customerByConvo = Object.fromEntries(convoRows.map((r) => [r.id, r.customer_id]))

  for (let i = 0; i < convIds.length; i += INBOX_QUERY_CHUNK) {
    const slice = convIds.slice(i, i + INBOX_QUERY_CHUNK)
    const { data: unreadRows, error: ue } = await client
      .from('messages')
      .select('conversation_id, sender_id')
      .in('conversation_id', slice)
      .or('read.eq.false,read.is.null')
    if (ue) throw ue
    for (const m of unreadRows || []) {
      const row = m as { conversation_id: string; sender_id: string }
      const cust = customerByConvo[row.conversation_id]
      if (cust && row.sender_id === cust) {
        unreadByConvo[row.conversation_id] = (unreadByConvo[row.conversation_id] || 0) + 1
      }
    }
  }
  return unreadByConvo
}
