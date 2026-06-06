import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import {
  getBusinessSubdomain,
  getSiteHostKind,
  getSupportSiteUrl,
  normalizeHost,
  ROOT_DOMAIN,
} from '@/lib/siteHost'

const APP_PATH_PREFIXES = [
  '/signup',
  '/login',
  '/reset-password',
  '/feed',
  '/rules',
  '/profile',
  '/notifications',
  '/dashboard',
  '/pending-approval',
  '/account-suspended',
  '/auth',
  '/update-password',
  '/business',
  '/api',
]

/** Player app routes — only on the support portal host, not on business subdomains. */
const SUPPORT_ONLY_PATHS = [
  '/signup',
  '/login',
  '/reset-password',
  '/feed',
  '/rules',
  '/profile',
  '/notifications',
  '/dashboard',
  '/pending-approval',
  '/account-suspended',
  '/auth',
  '/update-password',
]

export async function middleware(req: NextRequest) {
  const url = req.nextUrl.clone()
  const { pathname } = url

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/__nextjs') ||
    pathname === '/favicon.ico' ||
    pathname === '/logo2.png' ||
    /\.(?:ico|svg|png|jpg|jpeg|gif|webp|woff2?|ttf|eot)$/i.test(pathname)
  ) {
    return NextResponse.next({ request: req })
  }

  if (pathname === '/fee') {
    url.pathname = '/feed'
    return NextResponse.redirect(url)
  }

  const hostname = req.headers.get('host') || ''
  const host = normalizeHost(hostname)
  const siteKind = getSiteHostKind(hostname)
  const subdomain = getBusinessSubdomain(hostname)
  const supportBase = getSupportSiteUrl()

  const isAppPath = APP_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  const isSupportOnlyPath = SUPPORT_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  // Business subdomain: public business pages only — player app lives on the support domain.
  if (siteKind === 'business-subdomain' && subdomain && subdomain !== 'www') {
    if (isSupportOnlyPath) {
      const target = new URL(pathname + url.search, supportBase)
      return NextResponse.redirect(target)
    }
    if (!isAppPath) {
      url.pathname = `/business/${subdomain}${pathname === '/' ? '' : pathname}`
      const res = NextResponse.rewrite(url, { request: req })
      res.headers.set('x-site-kind', 'business-subdomain')
      res.headers.set('x-business-slug', subdomain)
      return await withSupabaseSession(req, res)
    }
  }

  // Platform root: no duplicate support landing — send visitors to support portal.
  if (siteKind === 'platform-root' && pathname === '/') {
    return NextResponse.redirect(new URL('/', supportBase))
  }

  const res = NextResponse.next({ request: req })
  res.headers.set('x-site-kind', siteKind)
  if (subdomain) res.headers.set('x-business-slug', subdomain)
  return await withSupabaseSession(req, res)
}

async function withSupabaseSession(req: NextRequest, res: NextResponse) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) return res

  const prefetch = req.headers.get('next-router-prefetch') === '1'
  if (prefetch) return res

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          for (const { name, value, options } of cookiesToSet) {
            try {
              res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
            } catch {
              /* ignore invalid cookie metadata */
            }
          }
        },
      },
    })
    await Promise.race([
      supabase.auth.getUser(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 12_000)
      }),
    ])
  } catch {
    /* stale session — still serve page */
  }
  return res
}

export const config = {
  matcher: [
    '/((?!_next|__nextjs|favicon\\.ico|logo2\\.png|.*\\.(?:ico|svg|png|jpg|jpeg|gif|webp|woff2?|ttf|eot)$).*)',
  ],
}

export { ROOT_DOMAIN }
