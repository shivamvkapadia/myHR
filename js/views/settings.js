// Settings: organization, roles & permissions, appearance, account, backend.
import { html, on, $, formData, slugify } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { ROLES, ROLE_META, PERMISSIONS } from "../lib/perms.js";
import { app, refresh, loadMemberships, selectOrg, resetApp } from "../app.js";
import { go } from "../router.js";
import { toast, toastError, confirmDialog, setBusy } from "../ui/ui.js";
import { bindAppearance } from "../ui/appearance.js";
import { rolePill } from "../ui/bits.js";
import { SUPABASE_URL } from "../config.js";

export const title = "Settings";

const TABS = [
  { id: "appearance", label: "Appearance", icon: "palette" },
  { id: "account", label: "Account", icon: "key" },
  { id: "organization", label: "Organization", icon: "building", perm: "org.manage" },
  { id: "roles", label: "Roles & permissions", icon: "shield" },
  { id: "backend", label: "Backend", icon: "database" },
];

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
