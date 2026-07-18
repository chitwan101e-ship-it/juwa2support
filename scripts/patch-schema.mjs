import fs from 'fs'

const path = 'supabase/schema.sql'
let s = fs.readFileSync(path, 'utf8')

s = s.replace(
  /-- FRESH DATABASE: Run sections 2–3 only \(skip section 1 reset\).\r?\n-- REBUILD EXISTING: Run section 1 first, then sections 2–3./,
  `-- FRESH DATABASE: Run SECTION 2 only (complete bootstrap). Then run SECTION 3 for extras (notifications, RLS patches, realtime).
-- REBUILD EXISTING: Run SECTION 1 first, then SECTION 2, then SECTION 3.
-- Section 3 skips migrations already included in Section 2 (013, 014, etc.).`
)

s = s.replace(
  /-- ── Migration: 013_inbox_conversation_labels\.sql ──[\s\S]*?(?=-- ── Migration: 014_inbox_canned_replies\.sql ──)/,
  `-- ── Migration: 013_inbox_conversation_labels.sql ──
-- Skipped: inbox_label_definitions + conversation_inbox_labels already created in Section 2.

`
)

s = s.replace(
  /-- ── Migration: 014_inbox_canned_replies\.sql ──[\s\S]*?(?=-- ── Migration: 015_signup_phone_referral\.sql ──)/,
  `-- ── Migration: 014_inbox_canned_replies.sql ──
-- Skipped: inbox_canned_replies already created in Section 2.

`
)

s = s.replace(
  /-- SECTION 3: INCREMENTAL MIGRATIONS \(002–029\)\r?\n-- ============================================================\r?\n\r?\n/,
  `-- SECTION 3: INCREMENTAL MIGRATIONS (002–029)
-- ============================================================
-- If Section 2 completed successfully, continue here. Migrations 013/014 are skipped (duplicates).

`
)

s = s.replace(
  /-- TROUBLESHOOTING: relation already exists[\s\S]*?014_inbox_canned_replies\.sql as needed\./,
  `-- TROUBLESHOOTING
-- - "relation already exists" -> Section 3 duplicated Section 2; use this file (013/014 skipped) or run Section 1 reset.
-- - Fresh database -> Section 2, then Section 3.`
)

fs.writeFileSync(path, s)
console.log('schema.sql patched')
