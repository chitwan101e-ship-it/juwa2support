import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { sendApprovalWelcomeMessage } from '@/lib/approvalWelcomeMessage'
import { ensureSupportConversation } from '@/lib/ensureSupportConversation'
import {
  assignConversationInboxLabel,
  INBOX_LABEL_JUWA_APP,
} from '@/lib/assignConversationInboxLabel'
import { normalizePhoneForDedup } from '@/lib/phoneNormalize'
import { resolvePrimaryBusinessForSignup } from '@/lib/resolvePrimaryBusiness'

export type ProvisionGameUserInput = {
  gameUserId: string
  email: string
  username: string
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
}

export type ProvisionGameUserSuccess = {
  ok: true
  relayUserId: string
  email: string
  username: string
  gameUserId: string
  provisioned: boolean
}

export type ProvisionGameUserFailure = {
  ok: false
  status: number
  error: string
}

export type ProvisionGameUserResult = ProvisionGameUserSuccess | ProvisionGameUserFailure

function cleanUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').slice(0, 30)
}

function cleanGameUserId(raw: string): string {
  return raw.trim().slice(0, 128)
}

function cleanEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

function displayNames(input: ProvisionGameUserInput, username: string) {
  const first = (input.firstName?.trim() || username || 'Player').slice(0, 80)
  const last = (input.lastName?.trim() || 'User').slice(0, 80)
  return { firstName: first, lastName: last }
}

async function authUserIdForEmail(
  admin: SupabaseClient,
  email: string
): Promise<string | null> {
  const { data, error } = await admin.rpc('auth_user_id_for_email', { p_email: email })
  if (error) {
    if (error.code === '42883') {
      console.error('[provisionGameUser] auth_user_id_for_email RPC missing — run supabase/5_game_sso.sql')
    }
    throw error
  }
  return (data as string | null) ?? null
}

async function findProfileByGameUserId(admin: SupabaseClient, gameUserId: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, username, game_user_id, account_status')
    .eq('game_user_id', gameUserId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return data
}

async function findProfileById(admin: SupabaseClient, id: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, username, game_user_id, account_status')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return data
}

async function ensureUsernameAvailable(
  admin: SupabaseClient,
  username: string,
  exceptUserId?: string
): Promise<boolean> {
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) return true
  return exceptUserId != null && data.id === exceptUserId
}

async function linkCustomerToPrimaryBusiness(
  admin: SupabaseClient,
  userId: string,
  username: string,
  customerName: string,
  sendWelcome: boolean
) {
  const primaryBiz = await resolvePrimaryBusinessForSignup(admin)
  if (!primaryBiz) return

  const { error: fErr } = await admin.from('follows').insert({
    user_id: userId,
    business_id: primaryBiz.id,
  })
  if (fErr && fErr.code !== '23505') {
    console.error('[provisionGameUser] follow insert:', fErr.message)
  }

  const ensured = await ensureSupportConversation(admin, primaryBiz.id, userId)
  if ('error' in ensured) {
    console.error('[provisionGameUser] conversation:', ensured.error)
  } else {
    await assignConversationInboxLabel(
      admin,
      primaryBiz.id,
      ensured.conversationId,
      INBOX_LABEL_JUWA_APP
    )
  }

  if (sendWelcome && primaryBiz.staffSenderId) {
    await sendApprovalWelcomeMessage(admin, {
      businessId: primaryBiz.id,
      customerId: userId,
      staffSenderId: primaryBiz.staffSenderId,
      customerName,
      username,
      businessName: primaryBiz.name,
    })
  }
}

/**
 * Creates or updates a Relay customer profile for a Juwa game account.
 * No game password is stored or required.
 */
export async function provisionGameUser(
  admin: SupabaseClient,
  input: ProvisionGameUserInput
): Promise<ProvisionGameUserResult> {
  const gameUserId = cleanGameUserId(input.gameUserId)
  const email = cleanEmail(input.email)
  const username = cleanUsername(input.username)

  if (!gameUserId || !email || !username) {
    return { ok: false, status: 400, error: 'gameUserId, email, and username are required.' }
  }

  if (!email.includes('@')) {
    return { ok: false, status: 400, error: 'Invalid email.' }
  }

  const { firstName, lastName } = displayNames(input, username)
  const customerName = `${firstName} ${lastName}`.trim() || username
  const phoneRaw = input.phone?.trim() || null
  const phoneNorm = phoneRaw ? normalizePhoneForDedup(phoneRaw) : null

  let provisioned = false
  let relayUserId: string | null = null

  const byGameId = await findProfileByGameUserId(admin, gameUserId)
  if (byGameId?.id) {
    relayUserId = byGameId.id as string
  }

  if (!relayUserId) {
    const authId = await authUserIdForEmail(admin, email)
    if (authId) {
      const byEmail = await findProfileById(admin, authId)
      if (byEmail?.id) {
        if (byEmail.game_user_id && byEmail.game_user_id !== gameUserId) {
          return {
            ok: false,
            status: 409,
            error: 'Email is linked to a different game account.',
          }
        }
        relayUserId = byEmail.id as string
      }
    }
  }

  if (relayUserId) {
    const existing = await findProfileById(admin, relayUserId)
    if (!existing) {
      return { ok: false, status: 500, error: 'Profile lookup failed.' }
    }

    const usernameOk = await ensureUsernameAvailable(admin, username, relayUserId)
    if (!usernameOk) {
      return { ok: false, status: 409, error: 'Username already taken by another account.' }
    }

    const patch: Record<string, unknown> = {
      game_user_id: gameUserId,
      first_name: firstName,
      last_name: lastName,
      account_status: existing.account_status === 'pending' ? 'approved' : existing.account_status,
    }
    if (username !== existing.username) patch.username = username
    if (phoneRaw) {
      patch.phone = phoneRaw
      if (phoneNorm) patch.phone_normalized = phoneNorm
    }

    const { error: updErr } = await admin.from('profiles').update(patch).eq('id', relayUserId)
    if (updErr) {
      console.error('[provisionGameUser] profile update', updErr)
      return { ok: false, status: 500, error: 'Could not update profile.' }
    }

    await linkCustomerToPrimaryBusiness(admin, relayUserId, username, customerName, false)

    return {
      ok: true,
      relayUserId,
      email,
      username,
      gameUserId,
      provisioned: false,
    }
  }

  const usernameFree = await ensureUsernameAvailable(admin, username)
  if (!usernameFree) {
    return { ok: false, status: 409, error: 'Username already taken.' }
  }

  if (phoneNorm) {
    const { data: phoneOwner } = await admin
      .from('profiles')
      .select('id')
      .eq('phone_normalized', phoneNorm)
      .is('deleted_at', null)
      .in('account_status', ['pending', 'approved', 'suspended', 'blocked'])
      .maybeSingle()
    if (phoneOwner?.id) {
      return { ok: false, status: 409, error: 'Phone number already in use.' }
    }
  }

  const randomPassword = crypto.randomBytes(32).toString('base64url')
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: randomPassword,
    email_confirm: true,
    user_metadata: {
      game_user_id: gameUserId,
      source: 'juwa_game',
    },
  })

  if (authErr || !authData.user) {
    if (authErr?.message?.toLowerCase().includes('already')) {
      return { ok: false, status: 409, error: 'Email already registered.' }
    }
    console.error('[provisionGameUser] createUser', authErr)
    return { ok: false, status: 500, error: 'Could not create auth user.' }
  }

  relayUserId = authData.user.id
  provisioned = true

  const { error: profileErr } = await admin.from('profiles').insert({
    id: relayUserId,
    username,
    first_name: firstName,
    last_name: lastName,
    phone: phoneRaw,
    phone_normalized: phoneNorm,
    game_user_id: gameUserId,
    role: 'customer',
    business_id: null,
    business_role: null,
      account_status: 'approved',
      email_verified: true,
      signup_source: 'juwa_app',
    })

  if (profileErr) {
    await admin.auth.admin.deleteUser(relayUserId)
    console.error('[provisionGameUser] profile insert', profileErr)
    if (profileErr.code === '23505') {
      return { ok: false, status: 409, error: 'Username or game ID already taken.' }
    }
    return { ok: false, status: 500, error: 'Could not create profile.' }
  }

  await linkCustomerToPrimaryBusiness(admin, relayUserId, username, customerName, true)

  return {
    ok: true,
    relayUserId,
    email,
    username,
    gameUserId,
    provisioned,
  }
}

/** Record a consumed player SSO jti (replay protection). */
export async function consumeGameSsoJti(
  admin: SupabaseClient,
  jti: string,
  gameUserId: string,
  expiresAtIso: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: insErr } = await admin.from('game_sso_jti_uses').insert({
    jti,
    game_user_id: gameUserId,
    expires_at: expiresAtIso,
  })

  if (insErr) {
    if (insErr.code === '23505') {
      return { ok: false, error: 'Token already used.' }
    }
    if (insErr.code === '42P01') {
      return { ok: false, error: 'SSO database not migrated. Run supabase/5_game_sso.sql.' }
    }
    console.error('[consumeGameSsoJti]', insErr)
    return { ok: false, error: 'Could not verify token nonce.' }
  }

  return { ok: true }
}
