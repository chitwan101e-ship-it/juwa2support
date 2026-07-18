export type ReplyEmbedProfile = {
  username?: string
  first_name?: string | null
  last_name?: string | null
  business_role?: string | null
}

export type ReplyEmbedMessage = {
  id: string
  body: string
  sender_id: string
  image_url?: string | null
  profiles?: ReplyEmbedProfile | ReplyEmbedProfile[] | null
}

export function oneEmbed<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

const IMAGE_PLACEHOLDER_BODIES = new Set(['??', '📷'])

export function isImageOnlyBody(body: string | null | undefined): boolean {
  const t = body?.trim()
  return !t || IMAGE_PLACEHOLDER_BODIES.has(t)
}

export function formatReplyPreviewText(
  body: string | null | undefined,
  hasImage: boolean
): string {
  if (hasImage && isImageOnlyBody(body)) return 'Photo'
  const text = (body ?? '').trim()
  if (!text) return hasImage ? 'Photo' : 'Message'
  return text.length > 140 ? `${text.slice(0, 137)}…` : text
}

export type ProfileDisplayNameInput = {
  username?: string | null
  first_name?: string | null
  last_name?: string | null
  role?: string | null
  business_role?: string | null
}

export function profileDisplayName(
  embed: ProfileDisplayNameInput | null | undefined,
  options?: { businessName?: string; fallback?: string }
): string {
  if (!embed) return options?.fallback ?? 'Member'
  const name = [embed.first_name, embed.last_name].filter(Boolean).join(' ').trim()
  if (name) return name
  const username = embed.username?.trim().replace(/^@+/, '')
  if (username) return `@${username}`
  if (embed.role === 'business') return options?.businessName?.trim() || 'Support team'
  return options?.fallback ?? 'Member'
}

export function displayNameInitials(label: string): string {
  const trimmed = label.trim()
  if (!trimmed || trimmed === 'Member') return '?'
  if (trimmed.startsWith('@')) {
    const handle = trimmed.slice(1)
    return (handle.slice(0, 2) || '?').toUpperCase()
  }
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (parts[0]?.slice(0, 2) || '?').toUpperCase()
}

export function replySenderLabel(
  embed: ReplyEmbedProfile | null,
  options?: { isMine?: boolean }
): string {
  if (options?.isMine) return 'You'
  if (!embed) return 'Message'
  return profileDisplayName(embed, { fallback: 'Message' })
}
