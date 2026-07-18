/** JUWA2 Support — brand tokens (matches logo: red/blue letters, gold frame, green accents, black). */
export const JUWA2 = {
  bg: '#000000',
  surface: '#0c0c0c',
  surfaceRaised: '#141414',
  border: 'rgba(212, 175, 55, 0.22)',
  gold: '#d4af37',
  goldLight: '#f5d040',
  goldDark: '#b8860b',
  red: '#e63946',
  redDark: '#c1121f',
  blue: '#2563eb',
  blueLight: '#3b82f6',
  green: '#16a34a',
  greenLight: '#22c55e',
  text: '#f5f5f5',
  textMuted: '#a3a3a3',
  textDim: '#737373',
  gradient: 'linear-gradient(135deg, #f5d040 0%, #d4af37 45%, #b8860b 100%)',
  gradientBtn: 'linear-gradient(135deg, #d4af37, #b8860b)',
  gradientBrand: 'linear-gradient(135deg, #e63946 0%, #2563eb 100%)',
  gradientChat: 'linear-gradient(135deg, #e63946, #2563eb)',
  shadowGold: '0 12px 40px -12px rgba(212, 175, 55, 0.35)',
  shadowBrand: '0 16px 48px -16px rgba(230, 57, 70, 0.25), 0 8px 32px -12px rgba(37, 99, 235, 0.2)',
} as const

/** Canonical product / business display name */
export const JUWA2_BRAND = 'JUWA2 Support'

export const JUWA2_COPY = {
  productName: JUWA2_BRAND,
  productTagline: 'Message the team. Read player updates.',
  supportShort: 'Player support',
  authSubtitle: 'Player support and updates, in one place.',
  approvalBadge: 'Instant access — start messaging right away',
  signupHint: 'Use your legal name. Your account is ready as soon as you sign up.',
  businessPoweredBy: `Powered by ${JUWA2_BRAND}`,
} as const
