#!/usr/bin/env node
// myHR MCP server — connects any MCP-capable AI agent (Claude Code, Claude
// Desktop, Cursor, …) to a myHR workspace.
//
//   MYHR_API_URL=https://<project>.supabase.co/functions/v1/agent-api \
//   MYHR_API_KEY=myhr_live_xxx node myhr-mcp.mjs
//
// Zero dependencies: speaks JSON-RPC 2.0 over stdio, Node 18+.
// Run `node myhr-mcp.mjs --check` to verify the key and print the workspace.

const API_URL = process.env.MYHR_API_URL || "";
const API_KEY = process.env.MYHR_API_KEY || "";

const S = {
  str: (description) => ({ type: "string", description }),
  num: (description) => ({ type: "number", description }),
  bool: (description) => ({ type: "boolean", description }),
};
const person = "An employee's name, email or id (partial names work).";

const TOOLS = [
  { name: "myhr_whoami", description: "Which myHR organization this key belongs to, what it may do, and current headcount. Call this first if unsure.", properties: {} },
  { name: "myhr_list_employees", description: "List or search people in the directory.",
    properties: { query: S.str("Match on name, email, title or department"), department: S.str("Exact department"), status: S.str("invited | active | on_leave | offboarded"), include_offboarded: S.bool("Include people who left (default false)") } },
  { name: "myhr_get_employee", description: "One person's profile with their manager, direct reports and open tasks.",
    properties: { employee: S.str(person) }, required: ["employee"] },
  { name: "myhr_add_employee", description: "Add a person to the directory. This runs the organization's onboarding automations, creating their checklist automatically. Requires an admin key.",
    properties: { full_name: S.str("Their full name"), email: S.str("Work email"), title: S.str("Job title"), department: S.str("Department, e.g. Engineering"), role: S.str("admin | manager | employee (default employee)"), manager: S.str(person), start_date: S.str("YYYY-MM-DD"), location: S.str("e.g. Remote"), employment_type: S.str("full_time | part_time | contractor | intern") },
    required: ["full_name", "email"] },
  { name: "myhr_update_employee", description: "Change someone's details, role or status (e.g. mark on leave or offboard, which runs offboarding automations). Requires an admin key.",
    properties: { employee: S.str(person), status: S.str("invited | active | on_leave | offboarded"), role: S.str("admin | manager | employee"), title: S.str("Job title"), department: S.str("Department"), manager: S.str(person), start_date: S.str("YYYY-MM-DD"), location: S.str("Location") },
    required: ["employee"] },
  { name: "myhr_list_boards", description: "List task boards and their columns.", properties: {} },
  { name: "myhr_list_tasks", description: "List tasks, newest due date first.",
    properties: { board: S.str("Board name"), assignee: S.str(person), status: S.str("open (default) | done | overdue | all"), due_before: S.str("YYYY-MM-DD"), query: S.str("Match on title"), limit: S.num("Max results (default 50)") } },
  { name: "myhr_create_task", description: "Create a task on a board.",
    properties: { title: S.str("What needs doing"), board: S.str("Board name (defaults to the first board)"), column: S.str("Column name (defaults to the first non-done column)"), assignee: S.str(person), due_date: S.str("YYYY-MM-DD"), priority: S.str("low | medium | high | urgent"), description: S.str("Longer detail"), labels: { type: "array", items: { type: "string" }, description: "Short labels" }, checklist: { type: "array", items: { type: "string" }, description: "Sub-items to tick off" } },
    required: ["title"] },
  { name: "myhr_complete_task", description: "Mark a task complete (or reopen it with done=false). Requires a manager or admin key.",
    properties: { task: S.str("Task id or part of its title"), done: S.bool("false reopens the task") }, required: ["task"] },
  { name: "myhr_update_task", description: "Change a task's title, assignee, due date or priority. Requires a manager or admin key.",
    properties: { task: S.str("Task id or part of its title"), title: S.str("New title"), assignee: S.str(person), due_date: S.str("YYYY-MM-DD"), priority: S.str("low | medium | high | urgent"), description: S.str("New description"), status: S.str("open | done") },
    required: ["task"] },
  { name: "myhr_onboarding_status", description: "Onboarding progress for new hires: how much is done and what's still outstanding.",
    properties: { employee: S.str(`${person} Omit for everyone in progress.`), include_complete: S.bool("Include finished pipelines") } },
  { name: "myhr_list_automations", description: "The rules that generate tasks when someone is added or offboarded. Requires a manager or admin key.", properties: {} },
  { name: "myhr_list_activity", description: "Recent activity in the workspace.", properties: { limit: S.num("Default 20") } },
  { name: "myhr_digest", description: "Summary of the workspace right now: open, overdue and due-today tasks plus upcoming start dates. Good for a daily standup post.", properties: {} },
  { name: "myhr_post_slack", description: "Post a message to the organization's connected Slack channel. Requires an admin key and Slack to be connected.",
    properties: { text: S.str("Message text (Slack mrkdwn)") }, required: ["text"] },
];

const toolList = () => TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: { type: "object", properties: t.properties, required: t.required ?? [] },
}));

async function callApi(action, params) {
  if (!API_URL || !API_KEY) throw new Error("Set MYHR_API_URL and MYHR_API_KEY in the MCP server's env.");
  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ action, params }),
    });
  } catch (e) {
    throw new Error(`Couldn't reach myHR at ${API_URL}: ${e.message}`);
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`myHR returned ${res.status}: ${text.slice(0, 300)}`); }
  if (!res.ok || body.error) throw new Error(body.error || `myHR returned ${res.status}`);
  return body.result;
}

// ---------- stdio JSON-RPC ----------
const write = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const ok = (id, result) => write({ jsonrpc: "2.0", id, result });
const err = (id, code, message) => write({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(msg) {
  const { id, method, params = {} } = msg;
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: params.protocolVersion || "2024-11-05",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "myhr", version: "1.0.0" },
      instructions: "myHR is a people-operations workspace: employee directory, onboarding automations and task boards. Use myhr_whoami first to see which organization this key belongs to.",
    });
  }
  if (method === "tools/list") return ok(id, { tools: toolList() });
  if (method === "ping") return ok(id, {});
  if (method === "tools/call") {
    const tool = TOOLS.find((t) => t.name === params.name);
    if (!tool) return err(id, -32602, `Unknown tool: ${params.name}`);
    try {
      const result = await callApi(tool.name.replace(/^myhr_/, "").replace(/^digest$/, "my_digest"), params.arguments ?? {});
      return ok(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
    } catch (e) {
      return ok(id, { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true });
    }
  }
  if (method?.startsWith("notifications/")) return; // no response expected
  if (id !== undefined) err(id, -32601, `Method not found: ${method}`);
}

if (process.argv.includes("--check")) {
  callApi("whoami", {})
    .then((r) => { console.log("Connected to myHR:", JSON.stringify(r, null, 2)); process.exit(0); })
    .catch((e) => { console.error("Failed:", e.message); process.exit(1); });
} else {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      try { handle(JSON.parse(line)); } catch { /* ignore malformed line */ }
    }
  });
  process.stdin.on("end", () => process.exit(0));
}
