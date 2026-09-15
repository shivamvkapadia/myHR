// myHR → Slack notifier.
//
// Handles two kinds of requests:
//  1. Database Webhooks (tasks / employees INSERT & UPDATE). Authenticated with
//     the `x-webhook-secret` header = SLACK_WEBHOOK_SECRET.
//  2. App calls { kind: "test" | "digest", org_id } from a signed-in admin.
//  3. Scheduled digests { kind: "digest-all" } with the webhook secret (pg_cron).
//
// Deploy:  supabase functions deploy slack-notify --no-verify-jwt
// Secrets: supabase secrets set SLACK_WEBHOOK_SECRET=<random string>
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const fmt = (d?: string | null) =>
  d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "";

async function post(orgId: string, text: string, event?: string) {
  const { data: integ } = await admin.from("org_integrations").select("*").eq("org_id", orgId).maybeSingle();
  if (!integ?.slack_webhook_url) return { skipped: "not connected" };
  if (event && integ.events?.[event] === false) return { skipped: `${event} disabled` };
  const res = await fetch(integ.slack_webhook_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Slack responded ${res.status}: ${await res.text()}`);
  return { ok: true };
}

async function name(table: string, id?: string | null) {
  if (!id) return null;
  const { data } = await admin.from(table).select(table === "employees" ? "full_name" : "name").eq("id", id).maybeSingle();
  return (data as any)?.full_name ?? (data as any)?.name ?? null;
}

async function digest(orgId: string) {
  const { data: org } = await admin.from("organizations").select("name").eq("id", orgId).single();
  const { data: tasks } = await admin.from("tasks").select("title, due_date, assignee_id").eq("org_id", orgId).is("completed_at", null);
  const today = new Date().toISOString().slice(0, 10);
  const open = tasks ?? [];
  const overdue = open.filter((t) => t.due_date && t.due_date < today);
  const lines = await Promise.all(
    overdue.slice(0, 5).map(async (t) => `• ${t.title} — ${(await name("employees", t.assignee_id)) ?? "unassigned"} (due ${fmt(t.due_date)})`),
  );
  const text = `:sunrise: *Daily digest for ${org?.name}*\n${open.length} open tasks · ${overdue.length} overdue · ${open.filter((t) => t.due_date === today).length} due today${lines.length ? "\n" + lines.join("\n") : ""}`;
  return post(orgId, text);
}

async function fromWebhook(p: any) {
  const r = p.record, old = p.old_record;
  if (!r?.org_id) return { skipped: "no record" };

  if (p.table === "employees") {
    if (p.type === "INSERT") {
      // Automations run in the same transaction, so their tasks already exist.
      const { count } = await admin.from("tasks").select("id", { count: "exact", head: true }).eq("subject_employee_id", r.id);
      const text = `:wave: *${r.full_name}* is joining${r.department ? ` ${r.department}` : ""}${r.title ? ` as ${r.title}` : ""}${r.start_date ? ` on ${fmt(r.start_date)}` : ""}. ${count ? `${count} onboarding tasks were created.` : ""}`;
      return post(r.org_id, text, "employee_added");
    }
    if (p.type === "UPDATE" && r.status === "offboarded" && old?.status !== "offboarded") {
      return post(r.org_id, `:outbox_tray: *${r.full_name}* has been offboarded.`, "employee_offboarded");
    }
    return { skipped: "employee change not announced" };
  }

  if (p.table === "tasks") {
    const board = await name("boards", r.board_id);
    if (p.type === "INSERT" && r.source !== "automation") {
      const [assignee, actor] = await Promise.all([name("employees", r.assignee_id), actorName(r.org_id, r.created_by)]);
      return post(r.org_id, `:memo: *${actor ?? "Someone"}* created *${r.title}*${assignee ? ` for ${assignee}` : ""}${r.due_date ? ` · due ${fmt(r.due_date)}` : ""} on _${board}_`, "task_created");
    }
    if (p.type === "UPDATE" && r.completed_at && !old?.completed_at) {
      const who = (await name("employees", r.assignee_id)) ?? "Someone";
      return post(r.org_id, `:white_check_mark: *${who}* completed *${r.title}* on _${board}_`, "task_completed");
    }
  }
  return { skipped: "ignored" };
}

async function actorName(orgId: string, userId?: string | null) {
  if (!userId) return null;
  const { data } = await admin.from("employees").select("full_name").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  return data?.full_name ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const secret = Deno.env.get("SLACK_WEBHOOK_SECRET");
    const trusted = !!secret && req.headers.get("x-webhook-secret") === secret;

    if (body.table) {
      if (!trusted) return json({ error: "Invalid webhook secret" }, 401);
      return json(await fromWebhook(body));
    }

    if (body.kind === "digest-all") {
      if (!trusted) return json({ error: "Invalid webhook secret" }, 401);
      const { data: integs } = await admin.from("org_integrations").select("org_id").not("slack_webhook_url", "is", null);
      const results = await Promise.all((integs ?? []).map((i) => digest(i.org_id).catch((e) => ({ error: e.message }))));
      return json({ sent: results.length });
    }

    // App request: must be an admin of the org.
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(jwt ?? "");
    if (!user) return json({ error: "Sign in first" }, 401);
    const { data: me } = await admin.from("employees").select("role, full_name").eq("org_id", body.org_id).eq("user_id", user.id).neq("status", "offboarded").maybeSingle();
    if (!me || !["owner", "admin"].includes(me.role)) return json({ error: "Only admins can post to Slack" }, 403);

    if (body.kind === "digest") return json(await digest(body.org_id));
    const { data: org } = await admin.from("organizations").select("name").eq("id", body.org_id).single();
    return json(await post(body.org_id, `:zap: myHR is connected to *${org?.name}*. ${me.full_name} sent this test message.`));
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
