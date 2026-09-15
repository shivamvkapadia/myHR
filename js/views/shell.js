// App chrome: sidebar, top bar, role-preview banner.
import { html, mount, on, $, avatar, hueOf, initials } from "../lib/dom.js";
import { icon, logo } from "../lib/icons.js";
import { ROLES, ROLE_META, rank } from "../lib/perms.js";
import { app, selectOrg, resetApp, isDone } from "../app.js";
import { go } from "../router.js";
import { menu, toast, confirmDialog } from "../ui/ui.js";
import { openPalette } from "../ui/palette.js";
import { openAppearanceDrawer } from "../ui/appearance.js";
import { openEmployeeForm, openBoardForm, quickTask } from "./modals.js";
import { isMac } from "../ui/bits.js";

const NAV = [
  { id: "home", label: "Home", icon: "home" },
  { id: "tasks", label: "My tasks", icon: "tasks", count: () => app.data.tasks.filter((t) => t.assignee_id === app.me?.id && !isDone(t)).length },
  { id: "boards", label: "Boards", icon: "board" },
  { id: "people", label: "People", icon: "users" },
  { id: "automations", label: "Automations", icon: "zap", perm: "automations.view" },
  { id: "files", label: "Files", icon: "folder" },
  { id: "slack", label: "Slack", icon: "hash", perm: "integrations.manage" },
  { id: "settings", label: "Settings", icon: "sliders" },
];

export function ensureShell(root) {
  if ($(".shell", root)) return;
  mount(root, html`<div class="shell">
    <aside class="sidebar glass" id="sidebar"></aside>
    <div class="nav-scrim" data-act="close-nav"></div>
    <div class="main">
      <header class="topbar glass" id="topbar"></header>
      <div id="banner"></div>
      <main class="content" id="view" tabindex="-1"></main>
    </div>
  </div>`);
  const shell = $(".shell", root);
  on(shell, "click", "[data-act]", (e, el) => {
    const fn = ACTIONS[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el); }
  });
  on(shell, "click", ".nav a, .nav-boards a", () => shell.classList.remove("nav-open"));
}

export function updateShell(section, crumb) {
  const sidebar = $("#sidebar");
  if (!sidebar) return;
  const org = app.org;
  const people = app.data.employees.filter((e) => e.status !== "offboarded").length;
  const boardId = section === "boards" ? location.hash.split("/")[3]?.split("?")[0] : null;

  mount(sidebar, html`
    <button class="org-switch" data-act="org-menu" data-menu-anchor aria-label="Switch organization">
      <span class="org-mark" style="--h:${hueOf(org.id)}">${initials(org.name)}</span>
      <span class="org-meta"><strong>${org.name}</strong><small>${ROLE_META[app.realRole]?.label} · ${people} people</small></span>
      ${icon("chevronsUpDown", "dim")}
    </button>

    <button class="search-trigger" data-act="palette">${icon("search")}<span>Search</span><kbd>${isMac() ? "⌘" : "Ctrl"} K</kbd></button>

    <nav class="nav" aria-label="Primary">
      ${NAV.filter((n) => !n.perm || app.can(n.perm)).map((n) => {
        const count = n.count?.();
        return html`<a href="#/app/${n.id}" class="${section === n.id ? "active" : ""}" ${section === n.id ? html`aria-current="page"` : ""}>
          ${icon(n.icon)}<span>${n.label}</span>${count ? html`<span class="nav-count">${count}</span>` : ""}
        </a>`;
      })}
    </nav>

    <div class="nav-boards">
      <div class="nav-label"><span>Boards</span>${app.can("boards.manage") ? html`<button class="icon-btn xs" data-act="new-board" aria-label="New board">${icon("plus")}</button>` : ""}</div>
      ${app.data.boards.map((b) => html`<a href="#/app/boards/${b.id}" class="${boardId === b.id ? "active" : ""}"><span class="board-dot" style="--c:${b.color}"></span><span>${b.name}</span></a>`)}
    </div>

    <div class="sidebar-foot">
      ${app.demo ? html`<a class="demo-card" href="#/app/settings/backend">
        <span class="demo-dot"></span>
        <span><strong>Demo mode</strong><small>Data stays in this browser. Connect Supabase →</small></span>
      </a>` : ""}
      <button class="me-btn" data-act="me-menu" data-menu-anchor>
        ${avatar(app.me?.full_name || app.user.email)}
        <span class="me-meta"><strong>${app.me?.full_name || app.user.email}</strong><small>${app.user.email}</small></span>
        ${icon("more", "dim")}
      </button>
    </div>`);

  mount($("#topbar"), html`
    <button class="icon-btn only-mobile" data-act="open-nav" aria-label="Open menu">${icon("menu")}</button>
    <div class="crumbs"><span class="hide-sm">${org.name}</span>${icon("chevronRight", "hide-sm dim")}<strong>${crumb}</strong></div>
    <span class="spacer"></span>
    <span class="live-pill ${app.demo ? "is-demo" : ""}" title="${app.demo ? "Demo mode: data is stored locally in this browser" : "Connected to Supabase with realtime updates"}"><i></i>${app.demo ? "Demo" : "Live"}</span>
    <button class="btn btn-ghost btn-sm" data-act="appearance">${icon("image")}<span class="hide-sm">Background</span></button>
    <button class="btn btn-primary btn-sm" data-act="new-menu" data-menu-anchor>${icon("plus")}<span>New</span></button>`);

  mount($("#banner"), app.previewRole ? html`<div class="preview-banner">
    ${icon("eye")}<span>Previewing as <strong>${ROLE_META[app.previewRole].label}</strong>. You're seeing only what this role can see and do.</span>
    <button class="btn btn-sm btn-secondary" data-act="exit-preview">Exit preview</button>
  </div>` : "");
}

const ACTIONS = {
  palette: () => openPalette(),
  appearance: () => openAppearanceDrawer(),
  "open-nav": () => $(".shell").classList.add("nav-open"),
  "close-nav": () => $(".shell").classList.remove("nav-open"),
  "new-board": () => openBoardForm(),
  "exit-preview": () => { app.setPreviewRole(null); app.rerender({ force: true }); },

  "org-menu": (el) => menu(el, [
    { heading: "Organizations" },
    ...app.memberships.map((m) => ({
      label: m.org.name,
      hint: ROLE_META[m.employee.role].label,
      active: m.org.id === app.org.id,
      onClick: async () => {
        if (m.org.id === app.org.id) return;
        await selectOrg(m.org.id);
        go("#/app/home");
        toast(`Switched to ${m.org.name}`);
      },
    })),
    "-",
    { label: "Create organization", icon: "plus", onClick: () => go("#/new-org") },
    app.can("org.manage") && { label: "Organization settings", icon: "building", onClick: () => go("#/app/settings/organization") },
  ].filter(Boolean), { width: 260 }),

  "me-menu": (el) => {
    const lower = ROLES.filter((r) => rank(r) < rank(app.realRole));
    menu(el, [
      { label: "Account", icon: "key", onClick: () => go("#/app/settings/account") },
      { label: "Appearance", icon: "palette", onClick: () => openAppearanceDrawer() },
      ...(lower.length ? ["-", { heading: "Preview as role" }, ...lower.map((r) => ({
        label: ROLE_META[r].label, icon: "eye", active: app.previewRole === r,
        onClick: () => { app.setPreviewRole(app.previewRole === r ? null : r); app.rerender({ force: true }); },
      }))] : []),
      "-",
      app.demo && {
        label: "Reset demo data", icon: "refresh",
        onClick: async () => {
          if (!(await confirmDialog({ title: "Reset demo data?", message: "Everything stored in this browser (accounts, organizations, files) will be erased.", confirmLabel: "Reset", danger: true }))) return;
          await app.backend.resetDemo();
          resetApp();
          go("#/");
        },
      },
      { label: "Sign out", icon: "logout", onClick: signOut },
    ].filter(Boolean), { align: "start", width: 240 });
  },

  "new-menu": (el) => menu(el, [
    app.can("tasks.create") && { label: "Task", icon: "tasks", hint: "N", onClick: () => quickTask() },
    app.can("people.manage") && { label: "Employee", icon: "userPlus", onClick: () => openEmployeeForm() },
    app.can("people.manage") && { label: "Import employees (CSV)", icon: "upload", onClick: () => go("#/app/people?import=1") },
    app.can("boards.manage") && { label: "Board", icon: "board", onClick: () => openBoardForm() },
    app.can("files.upload") && { label: "Upload file", icon: "folder", onClick: () => go("#/app/files?upload=1") },
  ].filter(Boolean), { align: "end", width: 230 }),
};

export async function signOut() {
  await app.backend.signOut();
  resetApp();
  go("#/");
}

export { logo };
