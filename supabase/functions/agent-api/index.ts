// myHR agent API — lets AI agents read and change a workspace with an API key.
//
// Auth:  Authorization: Bearer myhr_live_xxxxxxxx
// Call:  POST /agent-api  { "action": "list_tasks", "params": { ... } }
//
// The key is hashed (sha256) and matched against public.agent_keys. Each key
// carries a role, and every action is checked against the same permission
// matrix the app uses, so an agent can never do more than its role allows.
//
// Deploy: supabase functions deploy agent-api --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { ...cors, "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const MGR = ["owner", "admin", "manager"];
const ADM = ["owner", "admin"];
const PERMS: Record<string, string[] | null> = {
  whoami: null, list_employees: null, get_employee: null, list_boards: null, list_tasks: null,
  list_activity: null, onboarding_status: null, create_task: null, my_digest: null,
  complete_task: MGR, update_task: MGR, list_automations: MGR,
  add_employee: ADM, update_employee: ADM, post_slack: ADM,
};

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const today = () => new Date().toISOString().slice(0, 10);
const bad = (msg: string) => { throw new Error(msg); };

// Resolve an employee from an id, an email or a name fragment.
async function findEmployee(org: string, who: string) {
  if (!who) return null;
  const { data } = await db.from("employees").select("*").eq("org_id", org);
  const list = data ?? [];
  const l = who.toLowerCase();
  return list.find((e) => e.id === who)
    ?? list.find((e) => e.email.toLowerCase() === l)
    ?? list.find((e) => e.full_name.toLowerCase() === l)
    ?? list.find((e) => e.full_name.toLowerCase().includes(l))
    ?? null;
}

async function findBoard(org: string, name?: string) {
  const { data } = await db.from("boards").select("*").eq("org_id", org).order("created_at");
  const list = data ?? [];
  if (!name) return list[0] ?? null;
  const l = name.toLowerCase();
  return list.find((b) => b.id === name) ?? list.find((b) => b.name.toLowerCase() === l)
    ?? list.find((b) => b.name.toLowerCase().includes(l)) ?? null;
}

const slim = (e: any) => ({
  id: e.id, name: e.full_name, email: e.email, title: e.title, department: e.department,
  role: e.role, status: e.status, start_date: e.start_date, location: e.location,
});

const slimTask = (t: any, boards: any[], people: any[]) => ({
  id: t.id, title: t.title, board: boards.find((b) => b.id === t.board_id)?.name,
  status: t.completed_at ? "done" : "open", assignee: people.find((p) => p.id === t.assignee_id)?.full_name ?? null,
  due_date: t.due_date, priority: t.priority, labels: t.labels,
  overdue: !t.completed_at && !!t.due_date && t.due_date < today(),
  checklist: (t.checklist ?? []).map((c: any) => ({ text: c.text, done: c.done })),
  source: t.source, description: t.description || undefined,
});

async function run(action: string, p: any, key: { org_id: string; role: string }) {
  const org = key.org_id;
  const perm = PERMS[action];
  if (perm === undefined) bad(`Unknown action "${action}".`);
  if (perm && !perm.includes(key.role)) bad(`This key's role (${key.role}) can't ${action}.`);

  const people = async () => (await db.from("employees").select("*").eq("org_id", org)).data ?? [];
  const boards = async () => (await db.from("boards").select("*").eq("org_id", org)).data ?? [];

  switch (action) {
    case "whoami": {
      const { data: o } = await db.from("organizations").select("name, slug").eq("id", org).single();
      const staff = (await people()).filter((e) => e.status !== "offboarded");
      return { organization: o?.name, slug: o?.slug, key_role: key.role, headcount: staff.length };
    }

    case "list_employees": {
      let list = (await people()).filter((e) => (p.include_offboarded ? true : e.status !== "offboarded"));
      if (p.department) list = list.filter((e) => (e.department ?? "").toLowerCase() === String(p.department).toLowerCase());
      if (p.status) list = list.filter((e) => e.status === p.status);
      if (p.query) {
        const q = String(p.query).toLowerCase();
        list = list.filter((e) => `${e.full_name} ${e.email} ${e.title} ${e.department}`.toLowerCase().includes(q));
      }
      return { count: list.length, employees: list.map(slim) };
    }

    case "get_employee": {
      const e = await findEmployee(org, p.employee) ?? bad(`No employee matching "${p.employee}".`);
      const all = await people();
      const tasks = ((await db.from("tasks").select("*").eq("org_id", org)).data ?? []);
      const bs = await boards();
      return {
        ...slim(e),
        manager: all.find((m) => m.id === e.manager_id)?.full_name ?? null,
        reports: all.filter((r) => r.manager_id === e.id && r.status !== "offboarded").map((r) => r.full_name),
        open_tasks: tasks.filter((t) => t.assignee_id === e.id && !t.completed_at).map((t) => slimTask(t, bs, all)),
      };
    }

    case "add_employee": {
      if (!p.full_name || !p.email) bad("full_name and email are required.");
      const mgr = p.manager ? await findEmployee(org, p.manager) : null;
      const role = ["admin", "manager", "employee"].includes(p.role) ? p.role : "employee";
      const { data, error } = await db.from("employees").insert({
        org_id: org, full_name: p.full_name, email: String(p.email).toLowerCase(), title: p.title ?? null,
        department: p.department ?? null, role, manager_id: mgr?.id ?? null,
        employment_type: ["full_time", "part_time", "contractor", "intern"].includes(p.employment_type) ? p.employment_type : "full_time",
        start_date: /^\d{4}-\d{2}-\d{2}$/.test(p.start_date ?? "") ? p.start_date : null,
        location: p.location ?? null, status: "invited",
      }).select().single();
      if (error) bad(error.message);
      // Automations run in a trigger, so their tasks already exist.
      const { data: created } = await db.from("tasks").select("title, due_date").eq("subject_employee_id", data.id);
      return { added: slim(data), onboarding_tasks_created: created?.length ?? 0, tasks: created ?? [] };
    }

    case "update_employee": {
      const e = await findEmployee(org, p.employee) ?? bad(`No employee matching "${p.employee}".`);
      if (e.role === "owner") bad("Agents can't modify the owner.");
      const patch: Record<string, unknown> = {};
      for (const f of ["title", "department", "location", "phone", "start_date"]) if (p[f] !== undefined) patch[f] = p[f];
      if (p.status && ["invited", "active", "on_leave", "offboarded"].includes(p.status)) patch.status = p.status;
      if (p.role && ["admin", "manager", "employee"].includes(p.role)) patch.role = p.role;
      if (p.manager) patch.manager_id = (await findEmployee(org, p.manager))?.id ?? null;
      if (!Object.keys(patch).length) bad("Nothing to update.");
      const { data, error } = await db.from("employees").update(patch).eq("id", e.id).select().single();
      if (error) bad(error.message);
      return { updated: slim(data) };
    }

    case "list_boards": {
      const bs = await boards();
      const { data: cols } = await db.from("board_columns").select("*").eq("org_id", org).order("position");
      return { boards: bs.map((b) => ({ id: b.id, name: b.name, description: b.description, columns: (cols ?? []).filter((c) => c.board_id === b.id).map((c) => c.name) })) };
    }

    case "list_tasks": {
      const [bs, all] = [await boards(), await people()];
      let { data: tasks } = await db.from("tasks").select("*").eq("org_id", org);
      let list = tasks ?? [];
      if (p.board) { const b = await findBoard(org, p.board); list = list.filter((t) => t.board_id === b?.id); }
      if (p.assignee) { const e = await findEmployee(org, p.assignee); list = list.filter((t) => t.assignee_id === e?.id); }
      const status = p.status ?? "open";
      if (status === "open") list = list.filter((t) => !t.completed_at);
      else if (status === "done") list = list.filter((t) => t.completed_at);
      else if (status === "overdue") list = list.filter((t) => !t.completed_at && t.due_date && t.due_date < today());
      if (p.due_before) list = list.filter((t) => t.due_date && t.due_date <= p.due_before);
      if (p.query) list = list.filter((t) => t.title.toLowerCase().includes(String(p.query).toLowerCase()));
      list.sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
      const limit = Math.min(Number(p.limit) || 50, 200);
      return { count: list.length, tasks: list.slice(0, limit).map((t) => slimTask(t, bs, all)) };
    }

    case "create_task": {
      if (!p.title) bad("title is required.");
      const board = await findBoard(org, p.board) ?? bad("No board found.");
      const { data: cols } = await db.from("board_columns").select("*").eq("board_id", board.id).order("position");
      const col = (p.column && cols?.find((c) => c.name.toLowerCase() === String(p.column).toLowerCase()))
        ?? cols?.find((c) => !c.is_done) ?? cols?.[0] ?? bad("That board has no columns.");
      const assignee = p.assignee ? await findEmployee(org, p.assignee) : null;
      if (p.assignee && !assignee) bad(`No employee matching "${p.assignee}".`);
      const { data: last } = await db.from("tasks").select("position").eq("column_id", col.id).order("position", { ascending: false }).limit(1);
      const { data, error } = await db.from("tasks").insert({
        org_id: org, board_id: board.id, column_id: col.id, title: String(p.title).slice(0, 200),
        description: p.description ?? null, assignee_id: assignee?.id ?? null,
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(p.due_date ?? "") ? p.due_date : null,
        priority: ["low", "medium", "high", "urgent"].includes(p.priority) ? p.priority : "medium",
        labels: Array.isArray(p.labels) ? p.labels.slice(0, 8) : [],
        checklist: Array.isArray(p.checklist) ? p.checklist.map((c: string) => ({ id: crypto.randomUUID(), text: String(c), done: false })) : [],
        position: (last?.[0]?.position ?? 0) + 1000, source: "slack",
      }).select().single();
      if (error) bad(error.message);
      return { created: slimTask(data, await boards(), await people()) };
    }

    case "complete_task":
    case "update_task": {
      const { data: tasks } = await db.from("tasks").select("*").eq("org_id", org);
      const l = String(p.task ?? "").toLowerCase();
      const t = (tasks ?? []).find((x) => x.id === p.task) ?? (tasks ?? []).find((x) => x.title.toLowerCase().includes(l)) ?? bad(`No task matching "${p.task}".`);
      const patch: Record<string, unknown> = {};
      if (action === "complete_task" || p.status === "done" || p.status === "open") {
        const { data: cols } = await db.from("board_columns").select("*").eq("board_id", t.board_id).order("position");
        const wantDone = action === "complete_task" ? p.done !== false : p.status === "done";
        const target = wantDone ? cols?.find((c) => c.is_done) : cols?.find((c) => !c.is_done);
        if (!target) bad("That board has no matching column.");
        patch.column_id = target.id;
      }
      for (const f of ["title", "description", "due_date", "priority"]) if (p[f] !== undefined) patch[f] = p[f];
      if (p.assignee !== undefined) patch.assignee_id = p.assignee ? (await findEmployee(org, p.assignee))?.id ?? null : null;
      if (!Object.keys(patch).length) bad("Nothing to update.");
      const { data, error } = await db.from("tasks").update(patch).eq("id", t.id).select().single();
      if (error) bad(error.message);
      return { updated: slimTask(data, await boards(), await people()) };
    }

    case "onboarding_status": {
      const all = await people();
      const bs = await boards();
      const { data: tasks } = await db.from("tasks").select("*").eq("org_id", org).not("subject_employee_id", "is", null);
      const target = p.employee ? await findEmployee(org, p.employee) : null;
      const groups = new Map<string, any>();
      for (const t of tasks ?? []) {
        if (target && t.subject_employee_id !== target.id) continue;
        const e = all.find((x) => x.id === t.subject_employee_id);
        if (!e || e.status === "offboarded") continue;
        const g = groups.get(e.id) ?? { employee: e.full_name, start_date: e.start_date, total: 0, done: 0, outstanding: [] as any[] };
        g.total++;
        if (t.completed_at) g.done++;
        else g.outstanding.push(slimTask(t, bs, all));
        groups.set(e.id, g);
      }
      return { pipelines: [...groups.values()].filter((g) => p.include_complete || g.done < g.total) };
    }

    case "list_automations": {
      const { data } = await db.from("automations").select("*").eq("org_id", org);
      const bs = await boards();
      return { automations: (data ?? []).map((a) => ({ name: a.name, trigger: a.trigger, department: a.department, board: bs.find((b) => b.id === a.board_id)?.name, enabled: a.enabled, runs: a.run_count, steps: a.steps })) };
    }

    case "list_activity": {
      const { data } = await db.from("activity").select("*").eq("org_id", org).order("created_at", { ascending: false }).limit(Math.min(Number(p.limit) || 20, 100));
      return { activity: (data ?? []).map((a) => ({ who: a.actor_name, did: `${a.verb} ${a.target}`, at: a.created_at })) };
    }

    case "my_digest": {
      const [bs, all] = [await boards(), await people()];
      const { data: tasks } = await db.from("tasks").select("*").eq("org_id", org).is("completed_at", null);
      const open = tasks ?? [];
      const overdue = open.filter((t) => t.due_date && t.due_date < today());
      const dueToday = open.filter((t) => t.due_date === today());
      const starting = all.filter((e) => e.start_date && e.start_date >= today() && e.status !== "offboarded").sort((a, b) => a.start_date.localeCompare(b.start_date)).slice(0, 5);
      return {
        open: open.length, overdue: overdue.length, due_today: dueToday.length,
        overdue_tasks: overdue.slice(0, 10).map((t) => slimTask(t, bs, all)),
        due_today_tasks: dueToday.map((t) => slimTask(t, bs, all)),
        upcoming_starts: starting.map((e) => ({ name: e.full_name, title: e.title, start_date: e.start_date })),
      };
    }

    case "post_slack": {
      if (!p.text) bad("text is required.");
      const { data: integ } = await db.from("org_integrations").select("slack_webhook_url").eq("org_id", org).maybeSingle();
      if (!integ?.slack_webhook_url) bad("Slack isn't connected for this organization.");
      const res = await fetch(integ.slack_webhook_url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: String(p.text).slice(0, 3000) }),
      });
      const body = await res.text();
      if (!res.ok) bad(`Slack responded ${res.status}: ${body}`);
      return { posted: true, slack_response: body };
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing Authorization: Bearer <myHR agent key>" }, 401);

    const { data: key } = await db.from("agent_keys").select("*").eq("key_hash", await sha256(token)).is("revoked_at", null).maybeSingle();
    if (!key) return json({ error: "Invalid or revoked API key." }, 401);
    db.from("agent_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id).then(() => {});

    const body = req.method === "POST" ? await req.json() : {};
    const action = body.action ?? new URL(req.url).searchParams.get("action");
    if (!action) return json({ error: "Provide an action.", actions: Object.keys(PERMS) }, 400);

    return json({ ok: true, action, result: await run(action, body.params ?? body ?? {}, key) });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 400);
  }
});
