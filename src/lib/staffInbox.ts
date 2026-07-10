import type { SupabaseClient } from '@supabase/supabase-js'

export const CONVO_LIST_PAGE_SIZE = 1000
export const INBOX_PREVIEW_CHUNK = 500
export const INBOX_QUERY_CHUNK = 200

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

export type InboxLabelAssignmentDef = {
  id: string
  name: string
  color: string | null
  is_system: boolean
  preset_key?: string | null
}

/** Fast load of label definitions for a business (small table — do not block on thread fetch). */
export async function fetchInboxLabelDefinitions(
  client: SupabaseClient,
  businessId: string
): Promise<InboxLabelAssignmentDef[]> {
  const { data, error } = await client
    .from('inbox_label_definitions')
    .select('id, name, color, is_system, preset_key')
    .eq('business_id', businessId)
    .order('is_system', { ascending: false })
    .order('name')
  if (error) throw error
  return (data || []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    color: (r.color as string | null) ?? null,
    is_system: Boolean(r.is_system),
    preset_key: (r.preset_key as string | null | undefined) ?? null,
  }))
}

/** Chunked load of conversation_inbox_labels (avoids huge .in() failures). */
export async function fetchConversationInboxLabels(
  client: SupabaseClient,
  convIds: string[],
  defById: Record<string, InboxLabelAssignmentDef>
): Promise<Record<string, InboxLabelAssignmentDef[]>> {
  const labelsByConvo: Record<string, InboxLabelAssignmentDef[]> = {}
  if (convIds.length === 0) return labelsByConvo

  for (let i = 0; i < convIds.length; i += INBOX_QUERY_CHUNK) {
    const slice = convIds.slice(i, i + INBOX_QUERY_CHUNK)
    const { data: assignRows, error: assignErr } = await client
      .from('conversation_inbox_labels')
      .select('conversation_id, label_id')
      .in('conversation_id', slice)
    if (assignErr) throw assignErr

    for (const row of assignRows || []) {
      const r = row as { conversation_id: string; label_id: string }
      const d = defById[r.label_id]
      if (!d) continue
      if (!labelsByConvo[r.conversation_id]) labelsByConvo[r.conversation_id] = []
      labelsByConvo[r.conversation_id].push(d)
    }
  }

  for (const cid of Object.keys(labelsByConvo)) {
    labelsByConvo[cid].sort((a, b) => {
      if (a.is_system !== b.is_system) return a.is_system ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  return labelsByConvo
}

/** Chunked latest message previews per conversation. */
export async function fetchInboxLatestPreviews(
  client: SupabaseClient,
  convIds: string[]
): Promise<Record<string, { body: string; created_at: string }>> {
  const previewByConvo: Record<string, { body: string; created_at: string }> = {}
  if (convIds.length === 0) return previewByConvo

  let usedRpc = true
  for (let i = 0; i < convIds.length; i += INBOX_PREVIEW_CHUNK) {
    const slice = convIds.slice(i, i + INBOX_PREVIEW_CHUNK)
    const { data: previews, error: previewErr } = await client.rpc('inbox_latest_previews', {
      p_conversation_ids: slice,
    })
    if (previewErr) {
      usedRpc = false
      break
    }
    for (const row of previews || []) {
      const r = row as { conversation_id: string; body: string; created_at: string }
      previewByConvo[r.conversation_id] = { body: r.body, created_at: r.created_at }
    }
  }

  if (usedRpc) return previewByConvo

  for (let i = 0; i < convIds.length; i += INBOX_QUERY_CHUNK) {
    const slice = convIds.slice(i, i + INBOX_QUERY_CHUNK)
    const { data: msgs, error: me } = await client
      .from('messages')
      .select('conversation_id, body, created_at')
      .in('conversation_id', slice)
      .order('created_at', { ascending: false })
    if (me) throw me
    for (const m of msgs || []) {
      const row = m as { conversation_id: string; body: string; created_at: string }
      const prev = previewByConvo[row.conversation_id]
      if (!prev || new Date(row.created_at) > new Date(prev.created_at)) {
        previewByConvo[row.conversation_id] = { body: row.body, created_at: row.created_at }
      }
    }
  }

  return previewByConvo
}
