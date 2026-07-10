import type { SupabaseClient } from '@supabase/supabase-js'

/** System inbox label preset keys for support channel. */
export const INBOX_LABEL_WEBSITE = 'support_website'
export const INBOX_LABEL_JUWA_APP = 'support_juwa_app'
export const INBOX_LABEL_UNREAD = 'unread'
export const INBOX_LABEL_TECHNICAL_ESCALATION = 'technical_escalation'
export const INBOX_LABEL_GIVEAWAY = 'giveaway'

/** Labels managed automatically by the database (staff cannot toggle manually). */
export const AUTO_MANAGED_INBOX_LABEL_PRESETS = new Set([
  INBOX_LABEL_WEBSITE,
  INBOX_LABEL_JUWA_APP,
  INBOX_LABEL_UNREAD,
  INBOX_LABEL_TECHNICAL_ESCALATION,
])

export function isAutoManagedInboxLabelPreset(presetKey: string | null | undefined): boolean {
  return Boolean(presetKey && AUTO_MANAGED_INBOX_LABEL_PRESETS.has(presetKey))
}

/** Resolves Website vs Juwa App channel label from customer profile fields. */
export async function assignChannelLabelForCustomer(
  admin: SupabaseClient,
  businessId: string,
  conversationId: string,
  customerId: string
): Promise<void> {
  const { data: profile, error } = await admin
    .from('profiles')
    .select('signup_source, game_user_id')
    .eq('id', customerId)
    .maybeSingle()

  if (error) {
    console.error('[inbox-label:channel] profile lookup:', error.message)
    return
  }

  const presetKey =
    profile?.signup_source === 'juwa_app' || profile?.game_user_id
      ? INBOX_LABEL_JUWA_APP
      : INBOX_LABEL_WEBSITE

  await assignConversationInboxLabel(admin, businessId, conversationId, presetKey)
}

/** Idempotently attaches a system preset label to a support conversation thread. */
export async function assignConversationInboxLabel(
  admin: SupabaseClient,
  businessId: string,
  conversationId: string,
  presetKey: string
): Promise<void> {
  const { data: labelDef, error: defErr } = await admin
    .from('inbox_label_definitions')
    .select('id')
    .eq('business_id', businessId)
    .eq('preset_key', presetKey)
    .maybeSingle()

  if (defErr) {
    console.error(`[inbox-label:${presetKey}] lookup:`, defErr.message)
    return
  }
  if (!labelDef?.id) {
    console.error(`[inbox-label:${presetKey}] not found for business ${businessId}`)
    return
  }

  const { error: insErr } = await admin.from('conversation_inbox_labels').insert({
    conversation_id: conversationId,
    label_id: labelDef.id,
  })
  if (insErr && insErr.code !== '23505') {
    console.error(`[inbox-label:${presetKey}] assign:`, insErr.message)
  }
}

/** Removes a system preset label from a support conversation thread. */
export async function removeConversationInboxLabel(
  admin: SupabaseClient,
  businessId: string,
  conversationId: string,
  presetKey: string
): Promise<void> {
  const { data: labelDef, error: defErr } = await admin
    .from('inbox_label_definitions')
    .select('id')
    .eq('business_id', businessId)
    .eq('preset_key', presetKey)
    .maybeSingle()

  if (defErr) {
    console.error(`[inbox-label:${presetKey}] lookup:`, defErr.message)
    return
  }
  if (!labelDef?.id) return

  const { error: delErr } = await admin
    .from('conversation_inbox_labels')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('label_id', labelDef.id)
  if (delErr) {
    console.error(`[inbox-label:${presetKey}] remove:`, delErr.message)
  }
}

/** Keeps the Unread preset label in sync with staff unread message counts. */
export async function syncUnreadInboxLabelForConversation(
  admin: SupabaseClient,
  businessId: string,
  conversationId: string,
  hasUnread: boolean
): Promise<void> {
  if (hasUnread) {
    await assignConversationInboxLabel(admin, businessId, conversationId, INBOX_LABEL_UNREAD)
  } else {
    await removeConversationInboxLabel(admin, businessId, conversationId, INBOX_LABEL_UNREAD)
  }
}
