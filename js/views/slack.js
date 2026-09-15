// Slack integration settings.
import { html, mount, on, $, $$, todayISO, fmtDate } from "../lib/dom.js";
import { icon, logo } from "../lib/icons.js";
import { app, isDone, isOverdue } from "../app.js";
import { toast, toastError, setBusy } from "../ui/ui.js";
import { slackMessage, slackPreviewHTML } from "../lib/slack.js";
import { raw } from "../lib/dom.js";

export const title = "Slack";
export const perm = "integrations.manage";

const EVENTS = [
  ["employee_added", "New employee added", "Announce new hires with their start date and onboarding task count."],
  ["employee_offboarded", "Employee offboarded", "Let IT and managers know when someone leaves."],
  ["task_created", "Task created", "Post new cards from every board."],
  ["task_completed", "Task completed", "Celebrate finished work."],
];

let integ = null;
let loadedFor = null;

function digestText() {
  const open = app.data.tasks.filter((t) => !isDone(t));
  const today = todayISO();
  const lines = open.filter(isOverdue).slice(0, 5).map((t) => `• ${t.title} — ${app.emp(t.assignee_id)?.full_name || "unassigned"} (due ${fmtDate(t.due_date)})`);
  return slackMessage("digest", { org: app.org.name, open: open.length, overdue: open.filter(isOverdue).length, dueToday: open.filter((t) => t.due_date === today).length, lines });
}

function body() {
  if (!integ) return html`<div class="card"><span class="spinner"></span></div>`;
  const connected = !!integ.slack_webhook_url;
  const ev = integ.events || {};
  const sample = slackMessage("employee_added", { name: "Tomás Silva", title: "Engineer", department: "Engineering", start: "Monday", tasks: 9 });
  return html`
    <div class="slack-grid">
      <div class="stack">
        <section class="card">
          <header class="card-head"><h2>Connection</h2><span class="pill ${connected ? "status status-active" : "status status-invited"}"><i></i>${connected ? "Connected" : "Not connected"}</span></header>
          <form class="form" data-form>
            <label class="field"><span>Incoming webhook URL</span>
              <span class="input-wrap"><input class="input" type="password" name="slack_webhook_url" value="${integ.slack_webhook_url || ""}" placeholder="https://hooks.slack.com/services/…" autocomplete="off" /><button type="button" class="input-btn" data-reveal aria-label="Show">${icon("eye")}</button></span>
              <small class="field-hint">Only admins can see this. <a class="link" href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener">How to create a webhook ${icon("external")}</a></small>
            </label>
            <label class="field"><span>Channel name (for display)</span><input class="input" name="slack_channel" value="${integ.slack_channel || ""}" placeholder="#people-ops" /></label>
            <div class="field"><span>Post to Slack when…</span>
              <ul class="toggle-list">${EVENTS.map(([k, label, hint]) => html`<li><div><strong>${label}</strong><small>${hint}</small></div><label class="switch"><input type="checkbox" name="${k}" ${ev[k] !== false ? "checked" : ""} /><span></span></label></li>`)}</ul>
            </div>
            <div class="form-actions start">
              <button class="btn btn-primary" type="submit">Save</button>
              <button class="btn btn-secondary" type="button" data-send="test" ${connected ? "" : "disabled"}>${icon("send")}Send test message</button>
              <button class="btn btn-secondary" type="button" data-send="digest" ${connected ? "" : "disabled"}>${icon("refresh")}Sync digest now</button>
            </div>
          </form>
        </section>
        <section class="card">
          <header class="card-head"><h2>How sync works</h2></header>
          <ol class="how-list">
            ${app.demo
              ? html`<li><strong>Demo mode posts straight from your browser.</strong> Events you trigger here are sent to the webhook immediately.</li>`
              : html`<li><strong>Deploy the Edge Function</strong> <code>supabase functions deploy slack-notify --no-verify-jwt</code></li>
                <li><strong>Add Database Webhooks</strong> for <code>tasks</code> and <code>employees</code> (INSERT, UPDATE) pointing at the function, with header <code>x-webhook-secret</code>.</li>
                <li><strong>Optional daily digest</strong> — schedule the function with <code>pg_cron</code>. See the README.</li>`}
          </ol>
        </section>
      </div>
      <aside class="stack">
        <section class="card slack-preview">
          <header class="card-head"><h2>Preview</h2><span class="muted-text">${integ.slack_channel || "#people-ops"}</span></header>
          ${[sample, slackMessage("task_completed", { actor: app.me?.full_name, title: "Role-based access audit", board: "Q4 Launch" }), digestText()].map((t) => html`<div class="slack-msg">
            <span class="slack-app">${logo(34)}</span>
            <div><p class="slack-meta"><b>myHR</b><span class="slack-app-tag">APP</span><small>9:41 AM</small></p><p>${raw(slackPreviewHTML(t))}</p></div>
          </div>`)}
        </section>
      </aside>
    </div>`;
}

export function render() {
  return html`<header class="page-head"><div><h1 class="serif">Slack</h1><p class="page-sub">Keep your team in the loop without leaving the channel they already live in.</p></div></header><div data-slack>${body()}</div>`;
}

export async function bind(root) {
  const box = $("[data-slack]", root);
  if (loadedFor !== app.org.id) {
    integ = null;
    try { integ = await app.backend.getIntegration(app.org.id); loadedFor = app.org.id; } catch (err) { toastError(err); return; }
    mount(box, body());
  }
  on(root, "click", "[data-reveal]", (e, b) => { const i = b.previousElementSibling; i.type = i.type === "password" ? "text" : "password"; });
  on(root, "submit", "[data-form]", async (e, f) => {
    e.preventDefault();
    const url = f.slack_webhook_url.value.trim();
    if (url && !/^https:\/\/hooks\.slack\.com\//.test(url)) return toast("That doesn't look like a Slack webhook URL.", { type: "error" });
    const btn = $("button[type=submit]", f);
    setBusy(btn, true);
    try {
      integ = await app.backend.saveIntegration(app.org.id, {
        slack_webhook_url: url, slack_channel: f.slack_channel.value.trim(),
        events: Object.fromEntries(EVENTS.map(([k]) => [k, f[k].checked])),
      });
      toast("Slack settings saved", { type: "success" });
      mount(box, body());
    } catch (err) { toastError(err); setBusy(btn, false); }
  });
  on(root, "click", "[data-send]", async (e, b) => {
    const kind = b.dataset.send;
    setBusy(b, true, "Sending…");
    try {
      await app.backend.sendSlack(app.org.id, kind, kind === "digest" ? digestText() : slackMessage("test", { org: app.org.name }));
      toast(kind === "digest" ? "Digest sent to Slack" : "Test message sent — check your channel", { type: "success" });
    } catch (err) { toastError(err); }
    setBusy(b, false);
  });
}

export { $$ };
