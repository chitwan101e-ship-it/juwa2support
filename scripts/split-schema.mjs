import fs from 'fs'
import path from 'path'

const root = path.join(process.cwd(), 'supabase')
let schema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8')
schema = schema.replace(/^-- DEPRECATED:[\s\S]*?^--\s*\n/m, '')

const lines = schema.split(/\r?\n/)

function findLine(prefix) {
  return lines.findIndex((l) => l.includes(prefix))
}

const s1Start = findLine('SECTION 1: RESET')
const s2Start = findLine('SECTION 2: MAIN SCHEMA')
const s3Start = findLine('SECTION 3: INCREMENTAL MIGRATIONS')

const section1Body = lines.slice(s1Start + 3, s2Start).join('\n').trim()
const section2Body = lines.slice(s2Start + 3, s3Start).join('\n').trim()

// Parse Section 3 into migration chunks
const s3Lines = lines.slice(s3Start + 4)
const migrations = []
let current = null
for (const line of s3Lines) {
  const m = line.match(/^-- ── Migration: (\d+_[\w.]+\.sql) ──/)
  if (m) {
    if (current) migrations.push(current)
    current = { id: m[1], lines: [line] }
  } else if (current) {
    current.lines.push(line)
  }
}
if (current) migrations.push(current)

const SKIP = new Set(['013_inbox_conversation_labels.sql', '014_inbox_canned_replies.sql'])

function dedupeMigrationBody(body) {
  // Drop duplicate blocks that start with same comment line appearing twice
  const parts = body.split(/\n(?=-- )/g)
  const seen = new Set()
  const kept = []
  for (const part of parts) {
    const key = part.trim().slice(0, 120)
    if (key.length > 20 && seen.has(key)) continue
    if (key.length > 20) seen.add(key)
    kept.push(part)
  }
  return kept.join('\n').trim()
}

function idempotentPolicies(sql) {
  const out = []
  const ls = sql.split(/\r?\n/)
  for (let i = 0; i < ls.length; i++) {
    const line = ls[i]
    const m = line.match(/^create policy "([^"]+)"/)
    if (m) {
      let table = null
      for (let j = i; j < Math.min(i + 4, ls.length); j++) {
        const om = ls[j].match(/\bon\s+(public\.\w+|storage\.objects)\b/)
        if (om) {
          table = om[1]
          break
        }
      }
      if (table) {
        const dropLine = `drop policy if exists "${m[1]}" on ${table};`
        const recent = out.slice(-8).join('\n')
        if (!recent.includes(dropLine)) out.push(dropLine)
      }
    }
    out.push(line)
  }
  return out.join('\n')
}

let section3Body = migrations
  .filter((mg) => !SKIP.has(mg.id))
  .map((mg) => {
    if (SKIP.has(mg.id)) {
      return `-- ── Migration: ${mg.id} ──\n-- Skipped: already in 2_bootstrap.sql\n`
    }
    return dedupeMigrationBody(mg.lines.join('\n'))
  })
  .join('\n\n')

section3Body = idempotentPolicies(section3Body)

// Re-add explicit skips for 013/014
section3Body = section3Body.replace(
  /-- ── Migration: 012_customer_reply_notify_via_app\.sql ──[\s\S]*?(?=-- ── Migration: 015_)/,
  (block) =>
    `${block.trim()}

-- ── Migration: 013_inbox_conversation_labels.sql ──
-- Skipped: already in 2_bootstrap.sql

-- ── Migration: 014_inbox_canned_replies.sql ──
-- Skipped: already in 2_bootstrap.sql

`
)

const resetExtra = `
drop table if exists public.inbox_canned_replies cascade;
drop table if exists public.conversation_inbox_labels cascade;
drop table if exists public.inbox_label_definitions cascade;
drop table if exists public.signup_phone_attempts cascade;
drop function if exists public.auth_user_id_for_email(text) cascade;
drop function if exists public.inbox_latest_previews(uuid[]) cascade;
drop function if exists public.mark_customer_messages_read_for_staff(uuid) cascade;
drop function if exists public.mark_staff_messages_read_for_customer(uuid) cascade;
drop function if exists public.notify_staff_on_customer_message() cascade;
drop function if exists public.notify_customer_on_staff_reply() cascade;
drop function if exists public.seed_inbox_preset_labels_for_business() cascade;
drop function if exists public.is_business_user() cascade;
`.trim()

const startHere = `-- =============================================================================
-- Juwa2 Customer Support — Supabase SQL setup (READ THIS FIRST)
-- =============================================================================
--
-- Run IN ORDER in Supabase → SQL Editor (one file at a time):
--
--   SCENARIO A — Brand-new empty Supabase project
--     1) Skip 1_reset.sql
--     2) Run  2_bootstrap.sql
--     3) Run  3_extras.sql
--
--   SCENARIO B — Bootstrap already ran; "already exists" / policy errors
--     Run ONLY 3_extras.sql  (safe to re-run)
--
--   SCENARIO C — Wipe app data and start over (keeps auth.users)
--     1) Run  1_reset.sql
--     2) Run  2_bootstrap.sql
--     3) Run  3_extras.sql
--
-- Do NOT run schema.sql — use the numbered files above.
-- =============================================================================
`

fs.writeFileSync(path.join(root, '00_START_HERE.sql'), startHere)
fs.writeFileSync(
  path.join(root, '1_reset.sql'),
  `-- STEP 1 (optional): tear down app tables — Scenario C only\n\n${resetExtra}\n\n${section1Body}\n`
)
fs.writeFileSync(
  path.join(root, '2_bootstrap.sql'),
  `-- STEP 2: main bootstrap — run once on a fresh DB (Scenario A & C)\n\n${section2Body}\n`
)
fs.writeFileSync(
  path.join(root, '3_extras.sql'),
  `-- STEP 3: extras after bootstrap — Scenario A, B, or C (safe to re-run)\n\n${section3Body}\n`
)

console.log('OK — migrations in 3_extras:', migrations.map((m) => m.id).join(', '))
