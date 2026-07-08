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

export function replySenderLabel(
  embed: ReplyEmbedProfile | null,
  options?: { isMine?: boolean }
): string {
  if (options?.isMine) return 'You'
  if (!embed) return 'Message'
  const name = [embed.first_name, embed.last_name].filter(Boolean).join(' ').trim()
  if (name) return name
  if (embed.username) return `@${embed.username}`
  return 'Message'
}
