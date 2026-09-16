// Settings: organization, roles & permissions, appearance, account, backend.
import { html, mount, on, $, formData, slugify, copyText, timeAgo } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { ROLES, ROLE_META, PERMISSIONS } from "../lib/perms.js";
import { app, refresh, loadMemberships, selectOrg, resetApp } from "../app.js";
import { go } from "../router.js";
import { modal, toast, toastError, confirmDialog, setBusy } from "../ui/ui.js";
import { bindAppearance } from "../ui/appearance.js";
import { rolePill } from "../ui/bits.js";
import { SUPABASE_URL } from "../config.js";

export const title = "Settings";

const TABS = [
  { id: "appearance", label: "Appearance", icon: "palette" },
  { id: "account", label: "Account", icon: "key" },
  { id: "organization", label: "Organization", icon: "building", perm: "org.manage" },
  { id: "roles", label: "Roles & permissions", icon: "shield" },
  { id: "agents", label: "AI agents", icon: "branch", perm: "integrations.manage" },
  { id: "backend", label: "Backend", icon: "database" },
];

// Agent keys are loaded lazily per organization.
let agentKeys = null;
let keysFor = null;

const AGENT_ROLES = {
  employee: "Employee — read the directory, boards and onboarding; create tasks",
  manager: "Manager — also complete and edit any task, see automations",
  admin: "Admin — also add/update employees and post to Slack",
};

const mcpSnippet = (key = "myhr_live_…") => JSON.stringify({
  mcpServers: {
    myhr: {
      command: "node",
      args: ["/absolute/path/to/myHR/mcp/myhr-mcp.mjs"],
      env: {
        MYHR_API_URL: app.backend.agentEndpoint() || "https://<project>.supabase.co/functions/v1/agent-api",
        MYHR_API_KEY: key,
      },
    },
  },
}, null, 2);

function keysBody() {
  if (!agentKeys) return html`<span class="spinner"></span>`;
  if (!agentKeys.length) return html`<p class="muted-text">No agent keys yet.</p>`;
  return html`<ul class="key-list">${agentKeys.map((k) => html`<li class="${k.revoked_at ? "revoked" : ""}">
    <span class="key-main"><strong>${k.name}</strong><code>${k.key_prefix}…</code></span>
    ${rolePill(k.role)}
    <span class="muted-text">${k.revoked_at ? `Revoked ${timeAgo(k.revoked_at)}` : k.last_used_at ? `Last used ${timeAgo(k.last_used_at)}` : "Never used"}</span>
    ${k.revoked_at ? "" : html`<button class="btn btn-ghost btn-sm danger-text" data-revoke="${k.id}">Revoke</button>`}
  </li>`)}</ul>`;
}

function openKeyModal(onCreated) {
  const m = modal({
    title: "Create agent key",
    subtitle: "The key is shown once and acts without a login — treat it like a password.",
    size: "sm",
    body: html`<form class="form" id="keyForm">
      <label class="field"><span>Name</span><input class="input" name="name" required maxlength="60" placeholder="Claude Code" autofocus /></label>
      <label class="field"><span>Role</span>
        <select class="input" name="role">${Object.entries(AGENT_ROLES).map(([v, label]) => html`<option value="${v}" ${v === "manager" ? "selected" : ""}>${label}</option>`)}</select>
      </label>
    </form>`,
    footer: html`<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="keyForm">Create key</button>`,
  });
  $("#keyForm", m.el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = formData(e.target);
    if (!v.name) return;
    const btn = $("button[type=submit]", m.el);
    setBusy(btn, true);
    try {
      const { key } = await app.backend.createAgentKey(app.org.id, { name: v.name, role: v.role });
      mount($(".dialog-body", m.el), html`<div class="stack">
        <div class="callout callout-accent">${icon("key")}<div><strong>Copy your key now</strong><span>It won't be shown again. Create a new key if you lose it.</span></div></div>
        <div class="copy-field"><input class="input" readonly value="${key}" /><button class="btn btn-secondary" data-copy-key>${icon("copy")}Copy</button></div>
        <div class="field"><span>MCP config</span><pre class="code-block" data-snippet>${mcpSnippet(key)}</pre></div>
        <button class="btn btn-secondary" data-copy-snippet>${icon("copy")}Copy MCP config</button>
      </div>`);
      mount($(".dialog-foot", m.el), html`<button class="btn btn-primary" data-close>Done</button>`);
      $("[data-copy-key]", m.el).onclick = () => copyText(key).then(() => toast("Key copied", { type: "success" }));
      $("[data-copy-snippet]", m.el).onclick = () => copyText($("[data-snippet]", m.el).textContent).then(() => toast("MCP config copied", { type: "success" }));
      onCreated?.();
    } catch (err) {
      toastError(err);
      setBusy(btn, false);
    }
  });
}

function tabBody(tab) {
  if (tab === "appearance") return html`<section class="card"><header class="card-head"><h2>Appearance</h2><span class="muted-text">Saved to your profile and synced across devices</span></header><div data-ap></div></section>`;

  if (tab === "account") return html`<section class="card"><header class="card-head"><h2>Your account</h2></header>
    <form class="form narrow" data-account>
      <label class="field"><span>Full name</span><input class="input" name="full_name" value="${app.me?.full_name || app.user.full_name || ""}" /></label>
      <label class="field"><span>Email</span><input class="input" value="${app.user.email}" readonly /></label>
      <label class="field"><span>New password</span><input class="input" type="password" name="password" minlength="8" placeholder="Leave blank to keep current" autocomplete="new-password" /></label>
      <div class="form-actions start"><button class="btn btn-primary" type="submit">Save</button></div>
    </form></section>`;

  if (tab === "organization") return html`<section class="card"><header class="card-head"><h2>Organization</h2></header>
    <form class="form narrow" data-org>
      <label class="field"><span>Name</span><input class="input" name="name" required value="${app.org.name}" /></label>
      <label class="field"><span>Workspace URL</span><span class="input-wrap prefix"><span class="input-prefix">myhr/</span><input class="input" name="slug" value="${app.org.slug}" /></span>
        <small class="field-hint">Changing this breaks existing invite links.</small></label>
      <label class="field"><span>Industry</span><input class="input" name="industry" value="${app.org.industry || ""}" /></label>
      <label class="field"><span>Team size</span><input class="input" name="size" value="${app.org.size || ""}" /></label>
      <div class="form-actions start"><button class="btn btn-primary" type="submit">Save changes</button></div>
    </form></section>
    ${app.can("org.delete") ? html`<section class="card danger-zone"><header class="card-head"><h2>Danger zone</h2></header>
      <div class="danger-row"><div><strong>Delete ${app.org.name}</strong><p class="muted-text">Permanently deletes every employee record, board, task, automation and file.</p></div>
      <button class="btn btn-danger" data-delete-org>Delete organization</button></div></section>` : ""}`;

  if (tab === "roles") {
    const counts = Object.fromEntries(ROLES.map((r) => [r, app.data.employees.filter((e) => e.role === r && e.status !== "offboarded").length]));
    return html`<section class="card"><header class="card-head"><h2>Roles</h2><span class="muted-text">You are ${rolePill(app.realRole)}</span></header>
      <div class="role-cards">${ROLES.map((r) => html`<div class="role-card">${rolePill(r)}<p>${ROLE_META[r].blurb}</p><small>${counts[r]} ${counts[r] === 1 ? "person" : "people"}</small></div>`)}</div>
    </section>
    <section class="card table-card"><header class="card-head pad"><h2>Permission matrix</h2><span class="muted-text">Enforced by Postgres row-level security</span></header>
      <div class="table-scroll"><table class="table matrix"><thead><tr><th>Permission</th>${ROLES.map((r) => html`<th>${ROLE_META[r].label}</th>`)}</tr></thead>
      <tbody>${PERMISSIONS.map((p) => html`<tr><td>${p.label}</td>${ROLES.map((r) => html`<td class="${p.roles.includes(r) ? "yes" : "no"}">${icon(p.roles.includes(r) ? "check" : "x")}</td>`)}</tr>`)}</tbody></table></div>
      <footer class="table-foot">Change someone's role from their profile in People. Use <strong>Preview as role</strong> in your account menu to see the app through their eyes.</footer>
    </section>`;
  }

  if (tab === "agents") return html`
    <section class="card">
      <header class="card-head"><h2>Agent keys</h2><span class="muted-text">Scoped access for AI agents and scripts</span></header>
      ${app.demo ? html`<div class="callout">${icon("alert")}<div><strong>Agent keys need Supabase</strong><span>Demo mode lives only in this browser, so there's no endpoint for an agent to call. You can still create a key here to see how it works.</span></div></div>` : ""}
      <p class="muted-text">A key acts on ${app.org.name} without a login and obeys the same permission rules as a person with that role. Revoking takes effect immediately.</p>
      <div data-keys></div>
      <div class="form-actions start"><button class="btn btn-primary" data-new-key>${icon("plus")}Create agent key</button></div>
    </section>
    <section class="card">
      <header class="card-head"><h2>Connect an agent</h2></header>
      <p class="muted-text">Point any MCP client (Claude Code, Claude Desktop, Cursor) at <code>mcp/myhr-mcp.mjs</code>. It exposes 15 tools — directory, tasks, onboarding, automations and Slack.</p>
      <pre class="code-block" data-mcp>${mcpSnippet()}</pre>
      <div class="form-actions start">
        <button class="btn btn-secondary" data-copy-mcp>${icon("copy")}Copy config</button>
        <button class="btn btn-ghost" data-copy-endpoint>${icon("link")}Copy API endpoint</button>
      </div>
      <ol class="setup-guide">
        <li><strong>Deploy the API</strong> — <code>supabase functions deploy agent-api --no-verify-jwt</code></li>
        <li><strong>Create a key</strong> above and paste it into the config.</li>
        <li><strong>Check it works</strong> — <code>node mcp/myhr-mcp.mjs --check</code> prints your workspace or the exact error.</li>
      </ol>
      <p class="fine">Full guide, including plain HTTP usage: <code>mcp/README.md</code></p>
    </section>`;

  // backend
  return html`<section class="card"><header class="card-head"><h2>Backend</h2>
      <span class="pill status ${app.demo ? "status-invited" : "status-active"}"><i></i>${app.demo ? "Demo mode" : "Supabase connected"}</span></header>
    ${app.demo ? html`<p class="muted-text">Everything is stored in this browser's localStorage and IndexedDB. Connect Supabase to share one workspace across your whole team.</p>
      <ol class="setup-guide">
        <li><strong>Create a Supabase project</strong> at <a class="link" href="https://supabase.com/dashboard" target="_blank" rel="noopener">supabase.com ${icon("external")}</a>.</li>
        <li><strong>Run the schema.</strong> Open SQL Editor, paste <code>supabase/schema.sql</code> and run it.</li>
        <li><strong>Set auth URLs.</strong> Authentication → URL Configuration → Site URL = your GitHub Pages URL.</li>
        <li><strong>Add your keys</strong> to <code>js/config.js</code> (Project Settings → API): <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code>.</li>
        <li><strong>Push to GitHub.</strong> Pages redeploys and the Demo badge becomes Live.</li>
      </ol>`
    : html`<dl class="details"><div><dt>Project URL</dt><dd><code>${SUPABASE_URL}</code></dd></div><div><dt>Realtime</dt><dd>Boards, people and activity update live</dd></div><div><dt>Storage bucket</dt><dd><code>org-files</code></dd></div></dl>`}
  </section>`;
}

export function render(params) {
  const tabs = TABS.filter((t) => !t.perm || app.can(t.perm));
  const tab = tabs.find((t) => t.id === params[0])?.id || "appearance";
  return html`<header class="page-head"><div><h1 class="serif">Settings</h1><p class="page-sub">${app.org.name}</p></div></header>
    <div class="settings">
      <nav class="settings-nav">${tabs.map((t) => html`<a href="#/app/settings/${t.id}" class="${t.id === tab ? "active" : ""}">${icon(t.icon)}${t.label}</a>`)}</nav>
      <div class="settings-body">${tabBody(tab)}</div>
    </div>`;
}

export function bind(root) {
  const ap = $("[data-ap]", root);
  if (ap) bindAppearance(ap);

  const keysBox = $("[data-keys]", root);
  const loadKeys = async (force) => {
    if (force || keysFor !== app.org.id || !agentKeys) {
      try {
        agentKeys = await app.backend.listAgentKeys(app.org.id);
        keysFor = app.org.id;
      } catch (err) {
        agentKeys = [];
        toastError(err);
      }
    }
    if (document.body.contains(keysBox)) mount(keysBox, keysBody());
  };
  if (keysBox) loadKeys();

  on(root, "click", "[data-new-key]", () => openKeyModal(() => loadKeys(true)));
  on(root, "click", "[data-revoke]", async (e, b) => {
    const k = agentKeys.find((x) => x.id === b.dataset.revoke);
    if (!(await confirmDialog({ title: `Revoke "${k.name}"?`, message: "Any agent using this key stops working immediately.", confirmLabel: "Revoke", danger: true }))) return;
    try {
      await app.backend.revokeAgentKey(k.id);
      await loadKeys(true);
      toast("Key revoked");
    } catch (err) { toastError(err); }
  });
  on(root, "click", "[data-copy-mcp]", () => copyText($("[data-mcp]", root).textContent).then(() => toast("MCP config copied", { type: "success" })));
  on(root, "click", "[data-copy-endpoint]", () => {
    const url = app.backend.agentEndpoint();
    if (!url) return toast("Connect Supabase first — Demo mode has no API endpoint.", { type: "error" });
    copyText(url).then(() => toast("Endpoint copied", { type: "success" }));
  });

  on(root, "submit", "[data-account]", async (e, f) => {
    e.preventDefault();
    const v = formData(f);
    if (v.password && v.password.length < 8) return toast("Password must be at least 8 characters.", { type: "error" });
    const btn = $("button[type=submit]", f);
    setBusy(btn, true);
    try {
      await app.backend.updateAccount({ full_name: v.full_name, password: v.password || undefined });
      if (app.me && v.full_name && v.full_name !== app.me.full_name) await app.backend.updateEmployee(app.me.id, { full_name: v.full_name });
      await refresh(["employees"]);
      toast("Account updated", { type: "success" });
    } catch (err) { toastError(err); setBusy(btn, false); }
  });

  on(root, "submit", "[data-org]", async (e, f) => {
    e.preventDefault();
    const v = formData(f);
    const btn = $("button[type=submit]", f);
    setBusy(btn, true);
    try {
      const org = await app.backend.updateOrg(app.org.id, { name: v.name, slug: slugify(v.slug), industry: v.industry || null, size: v.size || null });
      app.org = org;
      await loadMemberships();
      app.rerender({ force: true });
      toast("Organization updated", { type: "success" });
    } catch (err) { toastError(err); setBusy(btn, false); }
  });

  on(root, "click", "[data-delete-org]", async () => {
    const name = app.org.name;
    if (!(await confirmDialog({ title: `Delete ${name}?`, message: "This cannot be undone. Everyone in the organization loses access immediately.", confirmLabel: "Delete forever", danger: true }))) return;
    if (prompt(`Type "${name}" to confirm`) !== name) return toast("Name didn't match — nothing was deleted.");
    try {
      await app.backend.deleteOrg(app.org.id);
      const user = app.user;
      resetApp();
      app.user = user;
      await loadMemberships();
      if (app.memberships.length) { await selectOrg(app.memberships[0].org.id); go("#/app/home"); }
      else go("#/new-org");
      toast(`${name} deleted`);
    } catch (err) { toastError(err); }
  });
}
