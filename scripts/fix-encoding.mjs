import fs from 'fs'
import path from 'path'

const R = '\uFFFD'

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory() && ent.name !== 'node_modules' && ent.name !== '.next') walk(p, out)
    else if (/\.(tsx?|jsx?|css)$/.test(ent.name)) out.push(p)
  }
  return out
}

function fixText(s) {
  // Item separators: name · @user · role
  s = s.replace(new RegExp(` ${R} `, 'g'), ' · ')

  const emDashPatterns = [
    ['not expired · older', 'not expired — older'],
    ['could not all be sent · check', 'could not all be sent — check'],
    ['skipped · no address', 'skipped — no address'],
    ['Could not load business record · check', 'Could not load business record — check'],
    ['dev server · not', 'dev server — not'],
    ['Main line · shows', 'Main line — shows'],
    ['Optional · shows', 'Optional — shows'],
    ['Publish above · they', 'Publish above — they'],
    ['Threads could not load · see', 'Threads could not load — see'],
    ['do not expire · search', 'do not expire — search'],
    ['recent threads · check', 'recent threads — check'],
    ['No labels · use', 'No labels — use'],
    ['business yet · approve', 'business yet — approve'],
    ['members match · see', 'members match — see'],
    ['support thread · only', 'support thread — only'],
    ['Thanks · investigating', 'Thanks — investigating'],
    ['Email could not be sent · check', 'Email could not be sent — check'],
    [' · removed', ' — removed'],
    [' · try another', ' — try another'],
    [' · try @username', ' — try @username'],
  ]
  for (const [from, to] of emDashPatterns) s = s.replaceAll(from, to)

  // Loading states and trailing ellipsis on words
  s = s.replace(new RegExp(`([a-zA-Z])${R}`, 'g'), '$1...')

  // Truncation
  s = s.replace(new RegExp(`\\)${R}`, 'g'), ')…')
  s = s.replace(new RegExp(`117\\)${R}`, 'g'), '117)…')

  // Range
  s = s.replace(new RegExp(`3${R}30`, 'g'), '3–30')

  // Placeholders ending with ...
  s = s.replace(new RegExp(`${R}"`, 'g'), '..."')
  s = s.replace(new RegExp(`${R}\``, 'g'), '...`')

  // Missing values
  s = s.replace(new RegExp(`'${R}'`, 'g'), "'—'")
  s = s.replace(new RegExp(`\\? '${R}' :`, 'g'), "? '...' :")

  // Username · Customer (keep middle dot)
  // Seen · time (keep middle dot)

  return s
}

const root = path.resolve(process.cwd(), 'src')
let totalFixed = 0
for (const file of walk(root)) {
  const original = fs.readFileSync(file, 'utf8')
  if (!original.includes(R)) continue
  const before = (original.match(new RegExp(R, 'g')) || []).length
  const fixed = fixText(original)
  const after = (fixed.match(new RegExp(R, 'g')) || []).length
  if (before !== after || fixed !== original) {
    fs.writeFileSync(file, fixed, 'utf8')
    console.log(`${path.relative(process.cwd(), file)}: ${before} → ${after}`)
    totalFixed += before - after
  }
}
console.log(`Done. Fixed ${totalFixed} replacement character(s).`)
