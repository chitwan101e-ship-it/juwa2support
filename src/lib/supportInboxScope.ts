import {
  INBOX_LABEL_JUWA_APP,
  INBOX_LABEL_WEBSITE,
} from '@/lib/assignConversationInboxLabel'

export type SupportInboxScope = 'both' | 'website' | 'app'

export type InboxChannelTab = 'inbox-website' | 'inbox-app'

const VALID_SCOPES = new Set<SupportInboxScope>(['both', 'website', 'app'])

export function parseSupportInboxScope(raw: unknown): SupportInboxScope | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim() as SupportInboxScope
  return VALID_SCOPES.has(v) ? v : null
}

export function effectiveSupportInboxScope(profile: {
  business_role: 'admin' | 'support' | 'technical' | null
  support_inbox_scope?: SupportInboxScope | null
}): SupportInboxScope | null {
  if (profile.business_role === 'admin') return 'both'
  if (profile.business_role === 'technical') return null
  return profile.support_inbox_scope ?? 'both'
}

export function scopeAllowsInboxTab(scope: SupportInboxScope, tab: InboxChannelTab): boolean {
  if (scope === 'both') return true
  if (scope === 'website') return tab === 'inbox-website'
  return tab === 'inbox-app'
}

export function defaultInboxTabForScope(scope: SupportInboxScope): InboxChannelTab {
  return scope === 'app' ? 'inbox-app' : 'inbox-website'
}

export function supportScopeLabel(scope: SupportInboxScope): string {
  switch (scope) {
    case 'both':
      return 'App + Website inboxes'
    case 'website':
      return 'Website inbox only'
    case 'app':
      return 'Juwa App inbox only'
  }
}

export function supportScopeShortLabel(scope: SupportInboxScope): string {
  switch (scope) {
    case 'both':
      return 'Both'
    case 'website':
      return 'Website'
    case 'app':
      return 'Juwa App'
  }
}

export function conversationChannelFromLabels(
  labels: { preset_key?: string | null }[]
): 'website' | 'app' | null {
  if (labels.some((l) => l.preset_key === INBOX_LABEL_JUWA_APP)) return 'app'
  if (labels.some((l) => l.preset_key === INBOX_LABEL_WEBSITE)) return 'website'
  return null
}

/** Whether a thread is visible to staff with the given inbox assignment. */
export function conversationMatchesScope(
  labels: { preset_key?: string | null }[],
  scope: SupportInboxScope
): boolean {
  if (scope === 'both') return true
  const channel = conversationChannelFromLabels(labels)
  if (!channel) return scope === 'website'
  return channel === scope
}
