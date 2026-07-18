/** Merge a fresh fetch with in-memory messages so optimistic / in-flight rows are not dropped. */
export function mergeChatMessages<T extends { id: string; created_at: string }>(
  prev: T[],
  fetched: T[],
  options?: { keepOrphanGraceMs?: number }
): T[] {
  const graceMs = options?.keepOrphanGraceMs ?? 45_000
  const cutoff = Date.now() - graceMs

  const byId = new Map<string, T>()
  for (const m of fetched) byId.set(m.id, m)

  for (const m of prev) {
    if (byId.has(m.id)) continue
    const created = new Date(m.created_at).getTime()
    if (!Number.isNaN(created) && created >= cutoff) {
      byId.set(m.id, m)
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}
