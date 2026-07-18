'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { ImageLightbox } from '@/components/ImageLightbox'
import { useMessageImageSrc } from '@/hooks/useMessageImageSrc'

type Props = {
  imageUrl: string
  alt?: string
  className?: string
  linkClassName?: string
  /** Bubble layout: slightly larger tap target + hover zoom hint. */
  variant?: 'inline' | 'bubble'
  hasCaptionBelow?: boolean
  /** Render only the resolved image, for use inside another interactive control. */
  interactive?: boolean
}

/** Renders a chat attachment; opens in an in-app lightbox instead of navigating away. */
export function ChatMessageImage({
  imageUrl,
  alt = 'Attachment',
  className,
  linkClassName,
  variant = 'inline',
  hasCaptionBelow = false,
  interactive = true,
}: Props) {
  const src = useMessageImageSrc(imageUrl)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  if (!interactive) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} draggable={false} />
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className={clsx(
          linkClassName ?? 'block cursor-pointer',
          variant === 'bubble' &&
            'relative group/image w-full transition-transform active:scale-[0.99]'
        )}
        aria-label="View image"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={className} draggable={false} />
        {variant === 'bubble' ? (
          <span
            className={clsx(
              'pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/45 to-transparent opacity-0 transition-opacity group-hover/image:opacity-100',
              hasCaptionBelow && 'rounded-none'
            )}
            aria-hidden
          />
        ) : null}
      </button>
      <ImageLightbox
        src={src}
        alt={alt}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        downloadFilename="chat-image.jpg"
      />
    </>
  )
}
