# myHR

People operations, beautifully organized. myHR is a people directory, onboarding automation engine and kanban task tool in one workspace, with enforced role-based access and Slack sync.

- **Static frontend.** Plain HTML/CSS/ES modules, no build step. Deploys straight to GitHub Pages.
- **Supabase backend.** Postgres + Row Level Security, Auth, Storage, Realtime, one Edge Function.
- **Demo mode.** With no Supabase keys, everything runs in the browser (localStorage + IndexedDB), so the site works the moment it's pushed.

## Features

| Area | What it does |
| --- | --- |
| Organizations | Sign-up wizard creates an organization (you become Owner). Multiple orgs per account with a switcher. |
| People | Directory with search/filters, table & card views, profile drawer, add/edit, change role, on leave, offboard, CSV import/export, invite links. |
| RBAC | Owner / Admin / Manager / Employee. Enforced in Postgres RLS + guard triggers, mirrored in the UI. "Preview as role" to see the app through someone else's eyes. |
| Automations | "When an employee is added/offboarded (in department X) → create these tasks on board Y", with day offsets and assignee rules. Runs server-side in a trigger. |
| Boards | Kanban with drag & drop, column management, templates, filters, task detail with checklist, labels, priority, due dates. |
| My tasks | Everything assigned to you, grouped by Overdue / Today / Next 7 days. |
| Home | Onboarding pipeline, KPIs, your week, live activity feed, headcount by department. |
| Files | Uploads to a private Supabase Storage bucket scoped per organization. |
| Slack | Incoming-webhook integration with per-event toggles, test message, digest, live preview. |
| Appearance | Light/dark/system, accent colors, workspace backgrounds (gradients, patterns, animated, or your own image), frosted/solid surfaces, density. Synced to your profile. |
| Extras | ⌘K command palette, `N` for a new task, realtime updates, responsive layout. |

## Project layout

```
index.html               App shell
css/app.css              Design system + all styles
js/config.js             ← put your Supabase URL + anon key here
js/main.js               Boot + hash router
js/app.js                Session / org state
js/data/local.js         Demo-mode backend
js/data/supabase.js      Supabase backend (same interface)
js/views/*.js            Pages (landing, auth, home, boards, people, …)
supabase/schema.sql      Tables, RLS policies, triggers, RPCs, storage
supabase/functions/slack-notify   Edge Function for Slack
```

## 1. Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Deploy from a branch →** `main` / `(root)`.
3. Open `https://<you>.github.io/<repo>/`. It runs in Demo mode until you connect Supabase.

## 2. Connect Supabase

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. **SQL Editor → New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql), click **Run**. (Safe to re-run later.)
3. **Authentication → URL Configuration**
   - Site URL: `https://<you>.github.io/<repo>/`
   - Redirect URLs: add the same URL (and `http://localhost:8080/` for local dev).
4. **Authentication → Providers → Email**: keep **Confirm email ON**. Invites link accounts by verified email.
5. **Project Settings → API**: copy the Project URL and the `anon` public key into [`js/config.js`](js/config.js):
   ```js
   export const SUPABASE_URL = "https://xxxx.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
   ```
   The anon key is meant to be public. RLS is what protects the data. **Never** put the `service_role` key in the frontend.
6. Commit and push. The top bar badge switches from **Demo** to **Live**.

### How accounts, orgs and invites work

- **Create organization:** `auth.signUp` stores the org details in user metadata. After the email is confirmed and the user signs in, the app calls `create_organization()`. That creates the org, the owner's employee row, two boards and the default onboarding/offboarding automations.
- **Add employee:** an admin inserts an `employees` row (`status = invited`). The `employees_after` trigger logs activity and runs matching automations. That generates onboarding tasks in the same transaction.
- **Invite:** copy the invite link (`#/join/<slug>?email=…`). When that person signs up and confirms their email, `claim_invites()` links their account to the employee row and sets them active. An existing account gets linked on their next sign-in.

## 3. Slack (optional)

1. Create a Slack app → **Incoming Webhooks** → add one for your channel. Paste the URL in **myHR → Slack** and save.
2. Deploy the function:
   ```bash
   supabase functions deploy slack-notify --no-verify-jwt
   supabase secrets set SLACK_WEBHOOK_SECRET=$(openssl rand -hex 24)
   ```
3. **Database → Webhooks → Create** two hooks (tables `employees` and `tasks`, events Insert + Update). Each one:
   - Type: Supabase Edge Function → `slack-notify`
   - HTTP header: `x-webhook-secret: <the secret from step 2>`
4. "Send test message" and "Sync digest now" in the app call the function directly (admins only).
5. **Daily digest:** enable `pg_cron` + `pg_net` and schedule:
   ```sql
   select cron.schedule('myhr-digest', '0 14 * * 1-5', $$
     select net.http_post(
       url := 'https://<project>.supabase.co/functions/v1/slack-notify',
       headers := jsonb_build_object('Content-Type','application/json','x-webhook-secret','<secret>'),
       body := '{"kind":"digest-all"}'::jsonb);
   $$);
   ```

In Demo mode, Slack messages are posted directly from the browser to the webhook, so you can try it without deploying anything.

## 4. Connect AI agents (optional)

Agents get their own API keys, scoped by role — an agent can never do more than its role allows.

```bash
supabase functions deploy agent-api --no-verify-jwt
```

Then **Settings → AI agents → Create agent key**, pick Employee / Manager / Admin, and copy the key (shown once).

**MCP** — `mcp/myhr-mcp.mjs` is a zero-dependency MCP server (Node 18+) exposing 15 tools: search the directory, add people (which fires onboarding automations), list/create/complete tasks, check onboarding progress, read activity, get a digest, post to Slack. Settings → AI agents generates the config for you:

```json
{
  "mcpServers": {
    "myhr": {
      "command": "node",
      "args": ["/absolute/path/to/myHR/mcp/myhr-mcp.mjs"],
      "env": {
        "MYHR_API_URL": "https://<project>.supabase.co/functions/v1/agent-api",
        "MYHR_API_KEY": "myhr_live_..."
      }
    }
  }
}
```

Verify before wiring it up: `node mcp/myhr-mcp.mjs --check`.

**Plain HTTP** if you're not using MCP:

```bash
curl -X POST https://<project>.supabase.co/functions/v1/agent-api \
  -H "Authorization: Bearer myhr_live_..." -H "Content-Type: application/json" \
  -d '{"action":"list_tasks","params":{"status":"overdue"}}'
```

Details and the full action list: [`mcp/README.md`](mcp/README.md).

## Local development

```bash
python -m http.server 8080
# open http://localhost:8080
```

ES modules need to be served over HTTP (not `file://`).

## Permission model

| Permission | Owner | Admin | Manager | Employee |
| --- | :-: | :-: | :-: | :-: |
| View directory, boards, tasks, files | ✓ | ✓ | ✓ | ✓ |
| Create tasks, upload files | ✓ | ✓ | ✓ | ✓ |
| Edit/move any task, manage boards & columns | ✓ | ✓ | ✓ | own/assigned |
| View automations | ✓ | ✓ | ✓ | |
| Add/edit/offboard employees, change roles | ✓ | ✓ | | |
| Automations, Slack, org settings | ✓ | ✓ | | |
| Delete organization, assign Owner | ✓ | | | |

Employees may update their own profile row, but a guard trigger blocks changes to role, status, title, department, manager and start date.
