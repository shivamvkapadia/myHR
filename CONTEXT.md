# myHR — Project Context

## What it is
A Trello-alternative service called **myHR**, focused on automating employee
work tasks (task/board management like Trello) with **Slack sync** built in,
plus an HR-flavored layer on top: a dashboard and a **role-based access
control (RBAC)** system.

## Core concept
- Board/task management similar to Trello (lists, cards, boards, assignments).
- Two-way sync with Slack (task updates reflected in Slack, Slack actions
  reflected in the app).
- Employee task automation — the "HR" angle: onboarding tasks, recurring
  work items, status tracking, etc.

## Requested features (v1 scope, from initial brief)
1. **Dashboard** — central view of tasks/boards/activity.
2. **Role-based access control (RBAC)** — different roles (e.g. admin,
   manager, employee) with different permissions/views.
3. **Slack sync** — service syncs task/board activity with Slack.
4. **Employee task automation** — automate recurring/standard employee
   work tasks.

## v1 Demo — implemented
Static HTML/CSS/JS dashboard (no build step), built for fast deploy to
GitHub Pages. Files: `index.html`, `style.css`, `script.js`.

Sections:
1. **Dashboard** — stat cards (employee count, tasks done/pending, Slack
   status) + team task checklist with checkboxes.
2. **Employees (admin-only / RBAC)** — employee metadata table (name,
   role, department, email, status). Locked with a notice when viewing
   as "Employee" role; visible when viewing as "Admin". Role is switched
   via a dropdown in the sidebar (demo of RBAC, not real auth yet).
3. **Slack Integration** — form to paste a Slack API key + default
   channel (saved to demo state only, not sent anywhere). Includes an
   "idea box" outlining how real two-way sync would work (slash
   commands, bot DMs, daily digest, Supabase Edge Function) — concept
   only, not wired up.
4. **Project Files** — drag-and-drop dropzone to list files locally in
   the browser (demo only, not persisted/uploaded anywhere yet).
5. **Sync with Slack button** — top bar button, currently a fake
   loading animation (no real API call).

Design: dark theme, purple/teal accent gradient, sidebar nav, card-based
panels — original look, not a Trello clone visually.

## Planned deployment
- Frontend: GitHub Pages (static, matches current file structure).
- Backend/data: Supabase (planned, not yet integrated) — likely to hold
  employees, tasks, and Slack config instead of the current in-memory
  JS arrays.
- Originally would have used Vercel, switched to Supabase + GitHub Pages
  for time constraints.

## Status
Demo v1 UI complete and functional in-browser (all data is hardcoded /
client-side, no backend yet). Next steps depend on further direction
from user — likely: wire up Supabase for real data + auth, and decide
how far to take real Slack integration.

## Open questions (still open)
- Real auth method for RBAC (currently just a role dropdown, not real
  login)?
- Supabase schema — employees table, tasks table, slack_config table?
- Real Slack integration — is faking it enough for this demo, or does
  it need to actually call the Slack API at some point?
- Multi-tenant or single company?
