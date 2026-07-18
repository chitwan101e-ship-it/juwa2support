'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FeedPostImage } from '@/components/FeedPostImage'
import { getSupportSiteUrl } from '@/lib/siteHost'
import { JUWA2_BRAND, JUWA2_COPY } from '@/lib/juwa2Theme'
import { ArrowLeft, Building2, ExternalLink, Loader2, Megaphone, UserPlus, UserMinus } from 'lucide-react'
import clsx from 'clsx'

type Biz = { id: string; name: string; slug: string; description: string | null; logo_url: string | null }
type Ann = {
  id: string
  title: string
  body: string
  image_url: string | null
  created_at: string
}

function timeAgo(iso: string) {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (sec < 60) return 'just now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function PublicBusinessPage() {
  const params = useParams()
  const slug = typeof params?.slug === 'string' ? params.slug : ''
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const supportUrl = getSupportSiteUrl()

  const [loading, setLoading] = useState(true)
  const [biz, setBiz] = useState<Biz | null>(null)
  const [announcements, setAnnouncements] = useState<Ann[]>([])
  const [error, setError] = useState<string | null>(null)

  const [uid, setUid] = useState<string | null>(null)
  const [isCustomer, setIsCustomer] = useState(false)
  const [following, setFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)

  const load = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    setError(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const userId = session?.user?.id ?? null
      setUid(userId)

      if (userId) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, role, account_status, deleted_at')
          .eq('id', userId)
          .maybeSingle()
        const p = prof as { role: string; account_status?: string; deleted_at?: string | null } | null
        setIsCustomer(
          Boolean(p?.role === 'customer' && !p?.deleted_at && p?.account_status === 'approved')
        )
      } else {
        setIsCustomer(false)
      }

      const { data: b, error: bErr } = await supabase.from('businesses').select('*').eq('slug', slug).maybeSingle()
      if (bErr || !b) {
        setBiz(null)
        setAnnouncements([])
        setError('This partner page was not found.')
        return
      }
      setBiz(b as Biz)

      const { data: ann, error: aErr } = await supabase
        .from('announcements')
        .select('id, title, body, image_url, created_at')
        .eq('business_id', (b as Biz).id)
        .is('deleted_at', null)
        .is('hidden_at', null)
        .order('created_at', { ascending: false })
        .limit(30)

      if (aErr) {
        setAnnouncements([])
      } else {
        setAnnouncements((ann || []) as Ann[])
      }

      if (userId && b) {
        const { data: fol } = await supabase
          .from('follows')
          .select('user_id')
          .eq('user_id', userId)
          .eq('business_id', (b as Biz).id)
          .maybeSingle()
        setFollowing(!!fol)
      } else {
        setFollowing(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }, [slug, supabase])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleFollow() {
    if (!uid || !biz || !isCustomer) {
      window.location.href = `${supportUrl}/signup`
      return
    }
    setFollowBusy(true)
    try {
      if (following) {
        const { error: delErr } = await supabase.from('follows').delete().eq('user_id', uid).eq('business_id', biz.id)
        if (delErr) throw delErr
        setFollowing(false)
      } else {
        const { error: insErr } = await supabase.from('follows').insert({ user_id: uid, business_id: biz.id })
        if (insErr) throw insErr
        setFollowing(true)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setFollowBusy(false)
    }
  }

  if (!slug) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <p className="text-slate-400">Invalid link.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !biz) {
    return (
      <div className="min-h-screen bg-slate-950 text-white px-4 py-10">
        <div className="max-w-lg mx-auto text-center">
          <p className="text-red-400 mb-4">{error || 'Not found.'}</p>
          <a href={supportUrl} className="text-slate-300 hover:underline inline-flex items-center gap-1">
            Go to {JUWA2_BRAND} <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/95 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 rounded-full hover:bg-white/10"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Partner page</p>
            <p className="font-bold truncate">{biz.name}</p>
          </div>
          <a
            href={supportUrl}
            className="shrink-0 text-xs font-semibold text-slate-300 hover:text-white inline-flex items-center gap-1 border border-white/15 px-3 py-1.5 rounded-lg"
          >
            {JUWA2_BRAND} <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 pb-16">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start gap-6">
            <div
              className={clsx(
                'w-24 h-24 rounded-2xl flex items-center justify-center shrink-0 border border-white/10',
                biz.logo_url ? 'p-0 overflow-hidden bg-black/30' : 'bg-slate-800'
              )}
            >
              {biz.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={biz.logo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <Building2 className="w-11 h-11 text-slate-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-extrabold tracking-tight">{biz.name}</h1>
              <p className="text-slate-400 text-sm mt-1">@{biz.slug}</p>
              <p className="text-slate-500 text-sm mt-3 leading-relaxed">
                {biz.description ||
                  `Official announcements from this partner. Player login and support chat are on ${JUWA2_BRAND} — not on this page.`}
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {isCustomer ? (
                  <button
                    type="button"
                    disabled={followBusy}
                    onClick={() => void toggleFollow()}
                    className={clsx(
                      'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors',
                      following
                        ? 'bg-white/10 text-white border border-white/20 hover:bg-white/15'
                        : 'bg-white text-slate-900 hover:bg-slate-100'
                    )}
                  >
                    {followBusy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : following ? (
                      <>
                        <UserMinus className="w-4 h-4" /> Following updates
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" /> Follow updates
                      </>
                    )}
                  </button>
                ) : (
                  <a
                    href={`${supportUrl}/signup`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-white text-slate-900 hover:bg-slate-100"
                  >
                    <UserPlus className="w-4 h-4" /> Join {JUWA2_BRAND} to follow
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        <section className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <Megaphone className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-bold text-white">Partner announcements</h2>
          </div>
          {announcements.length === 0 ? (
            <p className="text-slate-500 text-sm">No posts published yet.</p>
          ) : (
            <ul className="space-y-4">
              {announcements.map((a) => (
                <li
                  key={a.id}
                  className="rounded-2xl border border-white/10 bg-slate-900/50 p-4"
                >
                  <p className="text-xs text-slate-500 mb-2">{timeAgo(a.created_at)}</p>
                  <p className="font-semibold text-white text-lg">{a.title}</p>
                  <p className="text-slate-300 mt-2 whitespace-pre-wrap leading-relaxed">{a.body}</p>
                  {a.image_url ? (
                    <div className="mt-3">
                      <FeedPostImage imageUrl={a.image_url} alt="" rounded="xl" />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-12 text-center text-xs text-slate-600">{JUWA2_COPY.businessPoweredBy}</p>
      </main>
    </div>
  )
}
