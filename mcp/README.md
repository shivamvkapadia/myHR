# Connect an AI agent to myHR

Two ways in, both using the same API key:

1. **MCP server** (`myhr-mcp.mjs`) — for Claude Code, Claude Desktop, Cursor and anything else that speaks MCP. 15 tools: read the directory, add people, create and complete tasks, check onboarding, post to Slack.
2. **Plain HTTP** — one `POST` per action, for your own scripts or agent framework.

Both talk to the `agent-api` Edge Function, which checks the key's role on every call. An agent can never do more than its role allows.

## 1. Set up (once)

**Deploy the function**

```bash
supabase functions deploy agent-api --no-verify-jwt
```

**Create a key** — in myHR: **Settings → AI agents → Create agent key**. Give it a name and a role:

| Role | What the agent can do |
| --- | --- |
| Employee | Read the directory, boards, tasks, onboarding; create tasks |
| Manager | …plus complete/edit any task, see automations |
| Admin | …plus add & update employees, post to Slack |

The key is shown **once** (`myhr_live_…`). Store it like a password — it acts on your workspace without a login.

## 2. MCP

Add to your MCP config — Claude Code: `.mcp.json` in your project, or `claude mcp add`. Claude Desktop: `claude_desktop_config.json`.

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

Settings → AI agents generates this snippet with your real values filled in.

**Verify before wiring it up:**

```bash
MYHR_API_URL=... MYHR_API_KEY=... node mcp/myhr-mcp.mjs --check
```

Prints your organization name and headcount, or the exact error.

Then ask your agent things like:

- *"Who's starting at Northwind in the next two weeks, and is their onboarding on track?"*
- *"Add Alex Morgan, alex@acme.com, Product Designer in Design, starting March 3, reporting to Noor."* → creates the employee **and** their onboarding checklist.
- *"Anything overdue? Post a summary to Slack."*
- *"Create a task on Q4 Launch to audit the billing page, assign to Diego, due Friday, high priority."*

## 3. Plain HTTP

```bash
curl -X POST https://<project>.supabase.co/functions/v1/agent-api \
  -H "Authorization: Bearer myhr_live_..." \
  -H "Content-Type: application/json" \
  -d '{"action":"list_tasks","params":{"status":"overdue"}}'
```

Actions: `whoami`, `list_employees`, `get_employee`, `add_employee`, `update_employee`, `list_boards`, `list_tasks`, `create_task`, `complete_task`, `update_task`, `onboarding_status`, `list_automations`, `list_activity`, `my_digest`, `post_slack`.

Every response is `{ ok, action, result }`, or `{ ok: false, error }` with a 400/401.

## Notes

- Keys only work against **Supabase**. Demo mode lives in one browser, so there's nothing for an agent to connect to.
- Revoke a key any time in Settings → AI agents. Revocation is immediate.
- Agent-created tasks are tagged so you can tell them apart in the activity feed.
- The function uses the service-role key **server-side only** — it never reaches the browser.
