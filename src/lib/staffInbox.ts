import type { SupabaseClient } from '@supabase/supabase-js'

export const CONVO_LIST_PAGE_SIZE = 1000
/** Cap the staff inbox list to recent threads so cold loads stay fast. */
export const INBOX_LIST_MAX_ROWS = 200
export const INBOX_PREVIEW_CHUNK = 500
export const INBOX_QUERY_CHUNK = 200

export type BusinessConversationRow = {
  id: string
  customer_id: string
  updated_at: string
  staff_game_username?: string | null
}

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
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

  const chunkResults = await Promise.all(
    chunkIds(convIds, INBOX_PREVIEW_CHUNK).map(async (slice) => {
      const { data: counts, error: rpcErr } = await client.rpc('inbox_unread_customer_counts', {
        p_conversation_ids: slice,
      })
      if (rpcErr) {
        return fetchInboxUnreadCountsLegacy(client, convoRows, slice)
      }
      const part: Record<string, number> = {}
      for (const row of counts || []) {
        const r = row as { conversation_id: string; unread_count: number | string }
        part[r.conversation_id] = Number(r.unread_count) || 0
      }
      return part
    })
  )

  for (const part of chunkResults) Object.assign(unreadByConvo, part)
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

  const chunkResults = await Promise.all(
    chunkIds(convIds, INBOX_QUERY_CHUNK).map(async (slice) => {
      const { data: unreadRows, error: ue } = await client
        .from('messages')
        .select('conversation_id, sender_id')
        .in('conversation_id', slice)
        .or('read.eq.false,read.is.null')
      if (ue) throw ue
      const part: Record<string, number> = {}
      for (const m of unreadRows || []) {
        const row = m as { conversation_id: string; sender_id: string }
        const cust = customerByConvo[row.conversation_id]
        if (cust && row.sender_id === cust) {
          part[row.conversation_id] = (part[row.conversation_id] || 0) + 1
        }
      }
      return part
    })
  )

  for (const part of chunkResults) Object.assign(unreadByConvo, part)
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

  const chunkResults = await Promise.all(
    chunkIds(convIds, INBOX_QUERY_CHUNK).map(async (slice) => {
      const { data: assignRows, error: assignErr } = await client
        .from('conversation_inbox_labels')
        .select('conversation_id, label_id')
        .in('conversation_id', slice)
      if (assignErr) throw assignErr
      return (assignRows || []) as { conversation_id: string; label_id: string }[]
    })
  )

  for (const assignRows of chunkResults) {
    for (const row of assignRows) {
      const d = defById[row.label_id]
      if (!d) continue
      if (!labelsByConvo[row.conversation_id]) labelsByConvo[row.conversation_id] = []
      labelsByConvo[row.conversation_id].push(d)
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

/** All conversation IDs that have any of the given label definitions. */
export async function fetchConversationIdsForLabels(
  client: SupabaseClient,
  labelIds: string[]
): Promise<string[]> {
  if (labelIds.length === 0) return []
  const ids = new Set<string>()
  for (const slice of chunkIds(labelIds, INBOX_QUERY_CHUNK)) {
    const { data, error } = await client
      .from('conversation_inbox_labels')
      .select('conversation_id')
      .in('label_id', slice)
    if (error) throw error
    for (const row of data || []) {
      ids.add((row as { conversation_id: string }).conversation_id)
    }
  }
  return [...ids]
}

/** Load conversation rows for a business by id (chunked). */
export async function fetchBusinessConversationsByIds(
  client: SupabaseClient,
  businessId: string,
  conversationIds: string[]
): Promise<BusinessConversationRow[]> {
  if (conversationIds.length === 0) return []
  const rows: BusinessConversationRow[] = []
  for (const slice of chunkIds(conversationIds, INBOX_QUERY_CHUNK)) {
    const { data, error } = await client
      .from('conversations')
      .select('id, customer_id, updated_at, staff_game_username')
      .eq('business_id', businessId)
      .in('id', slice)
    if (error) throw error
    for (const row of data || []) {
      rows.push(row as BusinessConversationRow)
    }
  }
  return rows
}

/** Chunked latest message previews per conversation. */
export async function fetchInboxLatestPreviews(
  client: SupabaseClient,
  convIds: string[]
): Promise<Record<string, { body: string; created_at: string }>> {
  const previewByConvo: Record<string, { body: string; created_at: string }> = {}
  if (convIds.length === 0) return previewByConvo

  const chunks = chunkIds(convIds, INBOX_PREVIEW_CHUNK)
  const rpcResults = await Promise.all(
    chunks.map((slice) =>
      client.rpc('inbox_latest_previews', {
        p_conversation_ids: slice,
      })
    )
  )

  if (rpcResults.some((r) => r.error)) {
    const legacyChunks = await Promise.all(
      chunkIds(convIds, INBOX_QUERY_CHUNK).map(async (slice) => {
        const { data: msgs, error: me } = await client
          .from('messages')
          .select('conversation_id, body, created_at')
          .in('conversation_id', slice)
          .order('created_at', { ascending: false })
        if (me) throw me
        return (msgs || []) as { conversation_id: string; body: string; created_at: string }[]
      })
    )
    for (const msgs of legacyChunks) {
      for (const row of msgs) {
        const prev = previewByConvo[row.conversation_id]
        if (!prev || new Date(row.created_at) > new Date(prev.created_at)) {
          previewByConvo[row.conversation_id] = { body: row.body, created_at: row.created_at }
        }
      }
    }
    return previewByConvo
  }

  for (const { data: previews } of rpcResults) {
    for (const row of previews || []) {
      const r = row as { conversation_id: string; body: string; created_at: string }
      previewByConvo[r.conversation_id] = { body: r.body, created_at: r.created_at }
    }
  }

  return previewByConvo
}
