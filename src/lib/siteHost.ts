/**
 * Split traffic between the JUWA2 Support portal and business subdomains.
 *
 * - Support domain (NEXT_PUBLIC_SUPPORT_DOMAIN): login, feed, dashboard, landing
 * - Business subdomain (slug.NEXT_PUBLIC_ROOT_DOMAIN): public business page only — app routes redirect to support domain
 */
export const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'partners.juwa2support.com').replace(/^www\./, '')
export const SUPPORT_DOMAIN = (
  process.env.NEXT_PUBLIC_SUPPORT_DOMAIN ||
  process.env.NEXT_PUBLIC_ROOT_DOMAIN ||
  'localhost'
).replace(/^www\./, '')

export type SiteHostKind = 'support' | 'business-subdomain' | 'platform-root' | 'local'

export function normalizeHost(host: string): string {
  return host.replace(/:.*/, '').replace(/^www\./, '').toLowerCase()
}

export function getBusinessSubdomain(host: string): string | null {
  const h = normalizeHost(host)
  if (h === 'localhost' || h.endsWith('.localhost')) {
    const sub = h.split('.')[0]
    return sub && sub !== 'localhost' ? sub : null
  }
  if (h.endsWith(`.${ROOT_DOMAIN}`) && h !== ROOT_DOMAIN) {
    return h.slice(0, -(ROOT_DOMAIN.length + 1))
  }
  return null
}

export function getSiteHostKind(host: string): SiteHostKind {
  const h = normalizeHost(host)
  const subdomain = getBusinessSubdomain(host)

  if (subdomain && subdomain !== 'www') return 'business-subdomain'
  if (h === 'localhost' || h.endsWith('.localhost')) return 'support'
  if (h.endsWith('.vercel.app')) return 'support'
  if (h === SUPPORT_DOMAIN) return 'support'
  if (h === ROOT_DOMAIN) return 'platform-root'
  return 'support'
}

export function getSupportSiteUrl(): string {
  const vercelHost = process.env.VERCEL_URL?.trim()
  if (vercelHost && !process.env.PUBLIC_SITE_URL?.trim() && !process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    return `https://${vercelHost.replace(/\/$/, '')}`
  }

  const explicit =
    process.env.PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')

  if (SUPPORT_DOMAIN === 'localhost') {
    return (process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000').replace(/\/$/, '')
  }
  return `https://${SUPPORT_DOMAIN}`
}

export function isSupportPortalHost(host: string): boolean {
  return getSiteHostKind(host) === 'support'
}
