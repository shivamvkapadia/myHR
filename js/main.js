// Boot + routing.
import { applyAppearance } from "./theme.js";
import { html, mount, $, $$ } from "./lib/dom.js";
import { icon, logo } from "./lib/icons.js";
import { PERMISSIONS, ROLE_META } from "./lib/perms.js";
import { createBackend } from "./data/index.js";
import { app, afterSignIn, selectOrg, preferredOrgId, resetApp } from "./app.js";
import { setRouteHandler, parseHash, go } from "./router.js";
import { ensureShell, updateShell } from "./views/shell.js";
import { renderLanding } from "./views/landing.js";
import * as auth from "./views/auth.js";
import * as home from "./views/home.js";
import * as tasks from "./views/tasks.js";
import * as boards from "./views/boards.js";
import * as people from "./views/people.js";
import * as automations from "./views/automations.js";
import * as files from "./views/files.js";
import * as slack from "./views/slack.js";
import * as settings from "./views/settings.js";
import { toastError } from "./ui/ui.js";
import { openPalette } from "./ui/palette.js";
import { quickTask } from "./views/modals.js";

const VIEWS = { home, tasks, boards, people, automations, files, slack, settings };
const root = document.getElementById("root");
let current = null;
let pending = false;

function lockedPage(view) {
  const perm = PERMISSIONS.find((p) => p.key === view.perm);
  return html`<div class="locked">
    <div class="locked-icon">${icon("lock")}</div>
    <h1 class="serif">${view.title} is restricted</h1>
    <p>${ROLE_META[app.role].label}s can't ${perm?.label.toLowerCase() || "open this page"}. Ask an admin if you need access.</p>
    ${app.previewRole ? html`<button class="btn btn-secondary" data-act="exit-preview">Exit role preview</button>` : html`<a class="btn btn-secondary" href="#/app/home">Back to home</a>`}
  </div>`;
}

function renderView(section, params, query) {
  const view = VIEWS[section];
  const host = $("#view");
  const same = current && current.section === section && current.params.join("/") === params.join("/");
  const keep = same ? { top: host.scrollTop, x: Object.fromEntries($$("[data-keep-scroll]", host).map((el) => [el.dataset.keepScroll, el.scrollLeft])) } : null;
  const allowed = !view.perm || app.can(view.perm);

  const page = document.createElement("div");
  page.className = `page page-${section}`;
  mount(page, allowed ? view.render(params, query) : lockedPage(view));
  host.replaceChildren(page);
  if (allowed) view.bind?.(page, params, query);

  if (keep) {
    host.scrollTop = keep.top;
    $$("[data-keep-scroll]", host).forEach((el) => (el.scrollLeft = keep.x[el.dataset.keepScroll] || 0));
  } else {
    host.scrollTop = 0;
  }
  current = { section, params, query };
  const crumb = view.crumb?.(params) || view.title;
  updateShell(section, crumb);
  document.title = `${crumb} · ${app.org.name}`;
}

app.rerender = ({ force = false } = {}) => {
  if (!current || !app.org || !$("#view")) return;
  const active = document.activeElement;
  const typing = active && $("#view").contains(active) && active.matches("input, textarea, select, [contenteditable]");
  if (!force && (typing || document.body.classList.contains("is-dragging"))) {
    pending = true;
    return;
  }
  pending = false;
  renderView(current.section, current.params, current.query);
};

document.addEventListener("focusout", () => setTimeout(() => pending && app.rerender(), 60));
document.addEventListener("dragend", () => setTimeout(() => pending && app.rerender(), 60));

function loading() {
  if ($(".shell", root)) return;
  mount(root, html`<div class="boot">${logo(34)}<span class="spinner lg"></span></div>`);
}

async function route() {
  // Supabase auth redirects put tokens in the fragment; the client strips them.
  if (/^#(access_token|refresh_token|error|type)=/.test(location.hash)) return;
  const { parts, query } = parseHash();
  const [top, section = "home", ...params] = parts;

  try {
    if (top === "app") {
      if (!app.user) {
        loading();
        if (!(await afterSignIn())) return go(`#/login?next=${encodeURIComponent(location.hash)}`, { replace: true });
      }
      if (!app.memberships.length) return go("#/new-org", { replace: true });
      if (!app.org) {
        loading();
        await selectOrg(preferredOrgId());
      }
      if (!VIEWS[section]) return go("#/app/home", { replace: true });
      ensureShell(root);
      renderView(section, params, query);
      return;
    }

    current = null;
    const signedInWithOrg = app.user && app.memberships.length;
    switch (top) {
      case undefined:
        return renderLanding(root);
      case "login":
        if (signedInWithOrg) return go(query.next || "#/app/home", { replace: true });
        return auth.renderLogin(root, query);
      case "signup":
        if (signedInWithOrg) return go("#/app/home", { replace: true });
        return auth.renderSignup(root, query);
      case "join":
        return auth.renderJoin(root, parts[1], query);
      case "new-org":
        if (!app.user && !(await afterSignIn())) return go("#/signup", { replace: true });
        return auth.renderNewOrg(root, query);
      case "forgot":
        return auth.renderForgot(root, query);
      case "reset":
        return auth.renderReset(root, query);
      case "check-email":
        return auth.renderCheckEmail(root, query);
      default:
        return go("#/", { replace: true });
    }
  } catch (err) {
    console.error(err);
    toastError(err);
  }
}

const isTyping = (e) => e.target.closest?.("input, textarea, select, [contenteditable]");

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openPalette();
  } else if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e) && current && !$(".layer")) {
    if (app.can("tasks.create")) {
      e.preventDefault();
      quickTask();
    }
  }
});

async function boot() {
  applyAppearance();
  try {
    app.backend = await createBackend();
  } catch (err) {
    console.error(err);
    mount(root, html`<div class="boot boot-error">${logo(34)}<h1 class="serif">Couldn't reach Supabase</h1><p>Check <code>js/config.js</code> and your network connection, then reload.</p></div>`);
    return;
  }

  app.backend.onAuthChange((event) => {
    if (event === "SIGNED_OUT" && app.user) {
      resetApp();
      go("#/");
    }
    if (event === "PASSWORD_RECOVERY") go("#/reset", { replace: true });
  });

  try {
    if (await app.backend.getUser()) await afterSignIn();
  } catch (err) {
    console.error(err);
  }

  setRouteHandler(route);
  window.addEventListener("hashchange", route);
  if (app.backend.recovery) return go("#/reset", { replace: true });
  route();
}

boot();
