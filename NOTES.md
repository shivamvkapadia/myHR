# Working Notes

## 2026-09-13
- Project kicked off: "myHR" — Trello alternative with Slack sync, employee
  task automation, dashboard, RBAC.
- Built a single-page demo (`index.html` + `style.css` + `script.js`): dark
  purple/teal theme, hardcoded 40 employees, role dropdown, fake Slack sync
  button, drag-drop file list, and a login gate hardcoded to one email.
- All data was in-memory; no backend, no real auth.

## 2026-09-15 — rebuilt as a real product
User feedback: the demo looked generic ("AI slop") and they want to actually
ship it — real accounts, create-an-organization, add employees, Supabase
behind it, still on GitHub Pages. Mid-session they sent Craft's (craft.do)
design tokens as the visual direction.

**Deleted** `script.js` and `style.css`; rewrote everything.

### What's there now
- **Multi-tenant**: sign-up wizard creates an organization (3 steps: account →
  organization + workspace URL availability check → pick appearance). Multiple
  orgs per account with a sidebar switcher. Invite links (`#/join/<slug>?email=`),
  claimed on sign-in by matching verified email.
- **RBAC for real**: Owner/Admin/Manager/Employee in Postgres RLS + an
  `employees_guard` trigger for column-level protection. `js/lib/perms.js`
  mirrors it in the UI. Added "Preview as role".
- **Automations**: employee added/offboarded → generate task checklists with
  day offsets and assignee rules. Runs in a DB trigger (`run_automations`),
  mirrored in JS for Demo mode.
- **Boards**: kanban, HTML5 drag & drop, columns, templates, task modal with
  checklist/labels/priority/due date.
- **People**: search/filters, table + card views, profile drawer, CSV
  import/export, role changes, on leave / offboard.
- **Files** (Supabase Storage / IndexedDB), **Slack** (webhook + Edge Function
  + per-event toggles + preview), **Settings**, **Home** dashboard, **My tasks**,
  ⌘K command palette.
- **Appearance / background picker**: theme, accent, gradient / pattern /
  animated / custom-image workspace backgrounds, frosted vs solid, density.
  Saved to the profile. Landing page has a live background switcher on the mock.
- **Demo mode**: no Supabase keys → localStorage + IndexedDB backend behind the
  same interface, seeded with Northwind Studio (26 people, 3 boards, 3
  automations). This is what GitHub Pages shows until keys are added.

### Design
Craft-inspired: white canvas, near-black pill buttons, mint `#9bd8a9` accent,
Newsreader serif headings + Inter body, 12–24px radii, soft shadows, light/dark.

### Testing
Drove the app in headless Chrome over CDP (script in the session scratchpad):
landing → demo login → home → boards → kanban → task modal → people → profile
→ automations → slack → settings → background change → add-employee drawer.
**No console errors.** Screenshots looked right.
- Gotcha: `Page.navigate` silently did nothing in that setup; launching Chrome
  with the URL directly and navigating by hash worked.
- Note: an early debug command ran `taskkill /IM chrome.exe`, which would have
  closed the user's own Chrome windows. Don't do that again — kill only the
  spawned process.

### Not done yet
- Never run against a live Supabase project (schema + adapter are untested in
  practice). Slack Edge Function not deployed.
- No notifications UI, time off, org chart, audit log page, or Slack → myHR
  slash commands.
