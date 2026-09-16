# myHR — Project Context

## What it is
**myHR** is a people-operations product: a team directory with real role-based
access control, an onboarding automation engine, kanban task boards, project
files and Slack sync — in one workspace.

It started as a Trello alternative with Slack sync; it is now a full
multi-tenant product (organizations, accounts, invites), not a demo page.

## Stack / constraints
- **Frontend:** static HTML + CSS + ES modules. **No build step** (hard
  constraint — deploys as-is to GitHub Pages).
- **Backend:** Supabase (Postgres + RLS, Auth, Storage, Realtime, one Edge
  Function). Keys go in `js/config.js`.
- **Demo mode:** with no Supabase keys the app runs entirely in the browser
  (localStorage + IndexedDB) against the same adapter interface, so the
  GitHub Pages URL always works.
- Repo: https://github.com/shivamvkapadia/myHR

## Design direction
Modeled on Craft (craft.do): white canvas, near-black pill buttons, soft mint
accent (`#9bd8a9`), Newsreader serif headings + Inter body, 12–24px radii,
soft shadows. Deliberately not the old purple/teal gradient look.

## Architecture
```
js/config.js        Supabase URL + anon key (empty = Demo mode)
js/main.js          Boot + hash router (#/app/<section>/<params>)
js/app.js           Session, memberships, current org, data cache
js/router.js        Hash parsing / navigation
js/theme.js         Appearance: theme, accent, backgrounds, glass, density
js/data/index.js    Picks the backend
js/data/local.js    Demo backend (mirrors DB triggers in JS)
js/data/supabase.js Supabase backend (identical interface)
js/data/seed.js     Demo workspace: Northwind Studio, 26 people, 3 boards
js/lib/             dom (html`` escaping template), icons, perms, slack, idb
js/ui/              ui (toast/modal/drawer/menu), bits, appearance, palette
js/views/           landing, auth, shell, home, tasks, boards, people,
                    automations, files, slack, settings, modals
css/base.css        Tokens + components + app shell
css/pages.css       Page layouts + landing + auth
supabase/schema.sql Tables, RLS, triggers, RPCs, storage bucket
supabase/functions/slack-notify   Edge Function (DB webhooks + app calls)
supabase/functions/agent-api      Edge Function: API-key access for AI agents
mcp/myhr-mcp.mjs    Zero-dep MCP server (stdio JSON-RPC) wrapping agent-api
```

## AI agent access
`agent_keys` holds sha256 hashes of `myhr_live_…` keys (plaintext shown once,
created in the browser, never stored). The `agent-api` function hashes the
incoming Bearer token, looks up the key's org + role, and checks every action
against the same permission matrix the UI uses. 15 actions: directory reads,
`add_employee` (fires onboarding automations), task CRUD, onboarding status,
activity, digest, `post_slack`. Managed in Settings → AI agents.

## Data model
`organizations, profiles, employees, boards, board_columns, tasks,
automations, org_integrations, files, activity`.

An **employees row is the membership** — `user_id` links it to an auth user;
`user_id null + status invited` is a pending invite claimed by
`claim_invites()` on sign-in (matched on verified email).

## RBAC
Owner / Admin / Manager / Employee, enforced by RLS policies plus an
`employees_guard` trigger that blocks non-admins from changing role, status,
title, department, manager or start date. `js/lib/perms.js` mirrors this for
the UI. "Preview as role" lets an owner view the app as a lower role.

## Automations
Rules: *when employee added/offboarded (optionally per department) → create
these steps on this board*, each step with a day offset, assignee rule
(employee / manager / creator) and priority. Runs in the `employees_after`
trigger server-side; `local.js` mirrors the same logic.

## Status
Complete and working end-to-end in Demo mode; verified in headless Chrome
across every page with no console errors. Supabase path is written but not
yet run against a live project.

## Next / open
- Run `supabase/schema.sql` on a real project and connect keys.
- Slack: deploy the Edge Function + DB webhooks (Demo mode posts directly).
- Not built: notifications/bell, time off, org chart, per-department managers
  editing their own team, audit log UI, Slack slash commands back into myHR.
