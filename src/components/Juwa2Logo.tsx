import clsx from 'clsx'
import Image from 'next/image'
import { JUWA2_COPY } from '@/lib/juwa2Theme'

type Juwa2LogoProps = {
  theme?: 'dark' | 'light'
  size?: 'sm' | 'md' | 'lg' | 'hero'
  showWordmark?: boolean
  className?: string
  compact?: boolean
}

/** JUWA2 Support logo — use /logo2.png (PNG with alpha preferred). */
const sizeMap = {
  sm: { w: 112, h: 54 },
  md: { w: 152, h: 74 },
  lg: { w: 236, h: 114 },
  hero: { w: 340, h: 164 },
}

export default function Juwa2Logo({
  theme = 'dark',
  size = 'md',
  showWordmark = false,
  className,
  compact = false,
}: Juwa2LogoProps) {
  const s = sizeMap[size]
  const w = typeof s.w === 'number' ? s.w : 320
  const isLight = theme === 'light'

  return (
    <div className={clsx('inline-flex flex-col items-center gap-1 min-w-0', className)}>
      <div
        className={clsx('relative shrink-0 bg-transparent', isLight ? '' : 'mix-blend-lighten')}
        style={{ width: w, height: s.h }}
      >
        <Image
          src="/logo2.png"
          alt={JUWA2_COPY.productName}
          fill
          unoptimized
          sizes={`${w}px`}
          className="object-contain object-center bg-transparent"
          loading="eager"
          priority={size === 'hero'}
        />
      </div>

      {showWordmark ? (
        <div className="min-w-0 text-center">
          {!compact ? (
            <span
              className={clsx(
                'font-bold uppercase tracking-[0.2em] text-[10px] sm:text-xs',
                isLight ? 'text-amber-800' : 'text-[#d4af37]'
              )}
            >
              JUWA2 Support
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
