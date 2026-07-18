'use client'

import {
  formatReplyPreviewText,
  oneEmbed,
  type ReplyEmbedMessage,
} from '@/lib/chatReply'

type Props = {
  reply: ReplyEmbedMessage
  isFromTeam: boolean
  customerId: string
  className?: string
}

export function QuotedMessageBlock({ reply, isFromTeam, customerId, className }: Props) {
  const embed = oneEmbed(reply.profiles)
  const replyFromTeam = reply.sender_id !== customerId
  const senderName = replyFromTeam
    ? [embed?.first_name, embed?.last_name].filter(Boolean).join(' ').trim() ||
      (embed?.username ? `@${embed.username}` : 'Team')
    : 'Customer'
  const preview = formatReplyPreviewText(reply.body, Boolean(reply.image_url))

  return (
    <div
      className={
        className ??
        `mb-1.5 rounded-lg border-l-2 px-2 py-1.5 text-[11px] leading-snug ${
          isFromTeam
            ? 'border-white/40 bg-black/15 text-white/85'
            : 'border-[#6f54ff]/50 bg-black/20 text-[#c5cee8]'
        }`
      }
    >
      <p className="font-semibold truncate opacity-90">{senderName}</p>
      <p className="truncate opacity-80">{preview}</p>
    </div>
  )
}
