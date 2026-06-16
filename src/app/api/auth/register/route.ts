// src/app/api/auth/register/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizePhoneForDedup } from '@/lib/phoneNormalize'
import { notifyEveryBusinessAdmin } from '@/lib/notifyStaffAdmins'
import { sendApprovalWelcomeMessage } from '@/lib/approvalWelcomeMessage'
import { sendAccountApprovedEmail } from '@/lib/sendApprovalEmail'
import { resolvePrimaryBusinessForSignup } from '@/lib/resolvePrimaryBusiness'
import { getClientIp } from '@/lib/clientIp'
import { rateLimitRegister } from '@/lib/authRateLimit'
import { verifyTurnstileToken } from '@/lib/verifyTurnstile'
import { SIGNUP_OTP_VERIFICATION_FAILED } from '@/lib/signupOtp'
import crypto from 'crypto'

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function cleanReferralUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().replace(/^@+/, '').toLowerCase()
  if (!s) return null
  return s.slice(0, 30)
}

function cleanSignupQuestion(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().replace(/\s+/g, ' ')
  if (!s) return null
  return s.slice(0, 500)
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = await rateLimitRegister(ip)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many signup attempts from this network. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfterSec) },
        }
      )
    }

    const otpEnabled = process.env.ENABLE_OTP === 'true'
    const body = await req.json()
    const {
      email,
      password,
      otp,
      firstName,
      lastName,
      username,
      phone,
      referralUsername,
      signupQuestion,
      turnstileToken,
    } = body

    if (!otpEnabled) {
      const captcha = await verifyTurnstileToken(
        typeof turnstileToken === 'string' ? turnstileToken : undefined,
        ip
      )
      if (!captcha.ok) {
        return NextResponse.json({ error: captcha.error ?? 'Verification failed' }, { status: 400 })
      }
    }

    if (!email || !password || !firstName || !lastName || !username || !phone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (otpEnabled && !otp) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const phoneNorm = normalizePhoneForDedup(String(phone))
    if (!phoneNorm) {
      return NextResponse.json(
        { error: 'Enter a full phone number with country code (digits only after normalization).' },
        { status: 400 }
      )
    }

    const referral = cleanReferralUsername(referralUsername)
    const question = cleanSignupQuestion(signupQuestion)
    const supabase = createServiceClient()
    const clientIp = ip !== 'unknown' ? ip : null
    const userAgent = req.headers.get('user-agent') || null

    const logAttempt = async (blocked: boolean, blockReason: string | null) => {
      const { error } = await supabase.from('signup_phone_attempts').insert({
        phone_normalized: phoneNorm,
        attempted_email: String(email).toLowerCase(),
        attempted_username: String(username).replace(/^@/, ''),
        blocked,
        block_reason: blockReason,
        client_ip: clientIp,
        user_agent: userAgent,
      })
      if (error && error.code !== '42P01') console.error('[register] signup_phone_attempts:', error.message)
    }

    // ── 1. Verify OTP (optional via env flag) ────────────────────────────────
    if (otpEnabled) {
      const emailKey = String(email).trim().toLowerCase()
      const hashedOtp = hashToken(otp as string)
      const { data: tokenRow, error: tokenErr } = await supabase
        .from('otp_tokens')
        .select('id')
        .eq('email', emailKey)
        .eq('token', hashedOtp)
        .eq('used', false)
        .eq('purpose', 'signup')
        .not('verified_at', 'is', null)
        .gte('expires_at', new Date().toISOString())
        .maybeSingle()

      if (tokenErr || !tokenRow) {
        return NextResponse.json({ error: SIGNUP_OTP_VERIFICATION_FAILED }, { status: 400 })
      }

      await supabase.from('otp_tokens').update({ used: true }).eq('id', tokenRow.id)
    }

    // ── 2. Check username uniqueness ───────────────────────────────────────────
    const cleanUsername = String(username).replace(/^@/, '')
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle()

    if (existingUser) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 400 })
    }

    // ── 3. Block duplicate phone (pending / active / suspended / blocked) ─────
    const { data: phoneOwner } = await supabase
      .from('profiles')
      .select('id, username, account_status')
      .eq('phone_normalized', phoneNorm)
      .is('deleted_at', null)
      .in('account_status', ['pending', 'approved', 'suspended', 'blocked'])
      .maybeSingle()

    if (phoneOwner) {
      await logAttempt(true, 'duplicate_phone')
      await notifyEveryBusinessAdmin(supabase, {
        title: 'Signup blocked: duplicate phone',
        body: `Someone tried to register with a phone number already on file (@${phoneOwner.username}, status ${phoneOwner.account_status}). New attempt: email ${String(email).toLowerCase()}, username @${cleanUsername}.`,
        link: '/notifications',
      })

      return NextResponse.json(
        { error: 'An account with this phone number already exists.' },
        { status: 400 }
      )
    }

    // ── 4. Create Supabase auth user (self-serve customers only) ───────────────
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: otpEnabled,
    })

    if (authErr || !authData.user) {
      if (authErr?.message?.includes('already registered')) {
        await logAttempt(true, 'email_taken')
        return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
      }
      throw authErr
    }

    const userId = authData.user.id

    const { error: profileErr } = await supabase.from('profiles').insert({
      id: userId,
      username: cleanUsername,
      first_name: firstName,
      last_name: lastName,
      phone: String(phone).trim(),
      phone_normalized: phoneNorm,
      referral_username: referral,
      signup_question: question,
      role: 'customer',
      business_id: null,
      business_role: null,
      account_status: 'approved',
      email_verified: otpEnabled,
    })

    if (profileErr) {
      await supabase.auth.admin.deleteUser(userId)
      if (profileErr.code === '23505') {
        await logAttempt(true, 'unique_race')
        return NextResponse.json(
          { error: 'That username or phone number was just taken. Please try again.' },
          { status: 400 }
        )
      }
      console.error('[register] profile insert', profileErr)
      throw profileErr
    }

    await logAttempt(false, null)

    const customerName = `${firstName} ${lastName}`.trim() || cleanUsername
    const primaryBiz = await resolvePrimaryBusinessForSignup(supabase)
    let businessId: string | null = null
    let subdomain: string | null = null

    if (primaryBiz) {
      businessId = primaryBiz.id
      const { data: bizRow } = await supabase
        .from('businesses')
        .select('slug')
        .eq('id', primaryBiz.id)
        .maybeSingle()
      subdomain = (bizRow?.slug as string | undefined) ?? null

      const { error: fErr } = await supabase.from('follows').insert({
        user_id: userId,
        business_id: primaryBiz.id,
      })
      if (fErr && fErr.code !== '23505') {
        console.error('[register] follow insert:', fErr)
      }

      const { error: nErr } = await supabase.from('notifications').insert({
        user_id: userId,
        business_id: primaryBiz.id,
        type: 'account_approved',
        title: 'Welcome to JUWA2 Support',
        body: `You're all set. Open your feed for updates from ${primaryBiz.name}.`,
        link: '/feed',
      })
      if (nErr) console.error('[register] welcome notification:', nErr)

      if (primaryBiz.staffSenderId) {
        await sendApprovalWelcomeMessage(supabase, {
          businessId: primaryBiz.id,
          customerId: userId,
          staffSenderId: primaryBiz.staffSenderId,
          customerName,
          username: cleanUsername,
          businessName: primaryBiz.name,
        })
      }

      const emailKey = String(email).trim().toLowerCase()
      if (emailKey.includes('@')) {
        await sendAccountApprovedEmail({
          to: emailKey,
          customerName,
          username: cleanUsername,
          businessName: primaryBiz.name,
        })
      }
    }

    await notifyEveryBusinessAdmin(supabase, {
      title: 'New customer joined',
      body: `@${cleanUsername} (${firstName} ${lastName}) — phone: ${String(phone).trim()}${referral ? ` — referral: @${referral}` : ''}${question ? ` — question: "${question.slice(0, 120)}${question.length > 120 ? '…' : ''}"` : ''}.`,
      link: '/notifications',
    })

    return NextResponse.json({
      success: true,
      userId,
      businessId,
      subdomain,
    })
  } catch (err: unknown) {
    console.error('[register]', err)
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
  }
}
