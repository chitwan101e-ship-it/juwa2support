import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest, NextResponse } from 'next/server'

/**
 * Creates a browser Supabase session for `email` and attaches auth cookies to `response`.
 * Uses admin magic-link + verifyOtp (player never sees a login form).
 */
export async function attachRelaySessionCookies(
  admin: SupabaseClient,
  email: string,
  request: NextRequest,
  response: NextResponse,
  redirectTo: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, error: 'Supabase is not configured.' }
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  })

  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error('[attachRelaySessionCookies] generateLink', linkErr)
    return { ok: false, error: 'Could not create login session.' }
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
        )
      },
    },
  })

  const { error: otpErr } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  })

  if (otpErr) {
    console.error('[attachRelaySessionCookies] verifyOtp', otpErr)
    return { ok: false, error: 'Could not verify login session.' }
  }

  return { ok: true }
}

export function safeGameSsoRedirect(path: string | null | undefined): string {
  const fallback = '/feed?openChat=1'
  if (!path) return fallback
  const trimmed = path.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback
  return trimmed
}
