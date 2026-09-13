# Working Notes

## 2026-09-13
- Project kicked off. Folder was empty.
- User described the project: "myHR" — a Trello alternative that syncs
  with Slack, automates employee working tasks, with a dashboard and a
  role-based access control system.
- Created `CONTEXT.md` capturing the brief and open questions.
- Created this `NOTES.md` to log progress going forward.
- Next: waiting on user for more detail (tech stack, Slack sync depth,
  roles/permissions, tenancy model) before starting implementation.

- User specified concrete v1 dashboard features and gave a hard time
  box (~3-4 min), so built directly instead of asking more questions:
  - Admin-only RBAC section (employee metadata table, hidden/locked
    when role = Employee).
  - Employee metadata + per-task checklist with completion checkboxes.
  - Slack integration section: API key input field only (no real
    connection), plus a written-out "idea" section describing how a
    real sync would work — explicitly requested as concept-only.
  - "Sync with Slack" button in the top bar — demo animation only,
    no real API call yet.
  - Project Files section — drag/drop dropzone, lists files added
    in-browser (not persisted anywhere yet).
  - Chose a static HTML/CSS/JS build (no framework/build step) so it
    can go straight to GitHub Pages. User mentioned they'd normally
    use Vercel but is doing Supabase + GitHub Pages this time for
    speed — Supabase not yet wired in, current data is hardcoded in
    `script.js`.
- Built `index.html`, `style.css`, `script.js`. Dark theme, purple/teal
  accent, sidebar nav — original layout, not a visual Trello clone.
- Updated CONTEXT.md with the implemented feature list and deployment
  plan (GitHub Pages now, Supabase for data later).
- Not done yet: no real backend/auth, no real Slack API calls, no
  Supabase connection, no persistence of uploaded files.

- Added login gate (2-min follow-up ask): full-screen sign-in form
  before the app is visible. Hardcoded allow-list of one email —
  `svk7@illinois.edu` — treated as admin. That email shows "Admin
  approval needed — request sent" and unlocks the dashboard after a
  short delay; any other email is rejected instantly with an "Access
  denied" message. This is a client-side-only demo gate (email check
  lives in `script.js`), not real auth — trivially bypassable by
  reading the JS. Fine for a demo, not for production.
