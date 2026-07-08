'use client'

import clsx from 'clsx'
import { ChatMessageImage } from '@/components/ChatMessageImage'

type Tone = 'team' | 'customer' | 'sent' | 'internal'

type Props = {
  imageUrl: string
  /** Visible caption below the image (not placeholder bodies). */
  caption?: string | null
  showCaption?: boolean
  tone?: Tone
  className?: string
}

const toneRing: Record<Tone, string> = {
  team: 'ring-[#6f54ff]/20',
  customer: 'ring-white/[0.08]',
  sent: 'ring-violet-400/25',
  internal: 'ring-amber-500/30',
}

const toneCaptionBg: Record<Tone, string> = {
  team: 'bg-[#6f54ff] text-white',
  customer: 'bg-[#151d39] text-[#e2e6f5]',
  sent: 'bg-[#5b3fd4] text-white',
  internal: 'bg-amber-500/10 text-amber-50 border-t border-dashed border-amber-500/25',
}

/** Messenger-style photo bubble: edge-to-edge image, optional caption strip below. */
export function ChatMessageMedia({
  imageUrl,
  caption,
  showCaption = false,
  tone = 'customer',
  className,
}: Props) {
  const hasCaption = showCaption && Boolean(caption?.trim())

  return (
    <div
      className={clsx(
        'overflow-hidden shadow-[0_4px_24px_-8px_rgba(0,0,0,0.55)] ring-1',
        toneRing[tone],
        hasCaption ? 'rounded-[18px]' : 'rounded-[18px]',
        className
      )}
    >
      <ChatMessageImage
        imageUrl={imageUrl}
        alt="Photo"
        variant="bubble"
        hasCaptionBelow={hasCaption}
        linkClassName="block w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        className={clsx(
          'block w-full max-w-[min(100%,260px)] max-h-[min(360px,52dvh)] object-contain bg-[#0a1020]',
          hasCaption ? 'rounded-t-[18px] rounded-b-none' : 'rounded-[18px]'
        )}
      />
      {hasCaption ? (
        <div className={clsx('px-3 py-2 text-sm leading-snug', toneCaptionBg[tone])}>
          <p className="whitespace-pre-wrap break-words">{caption}</p>
        </div>
      ) : null}
    </div>
  )
}
